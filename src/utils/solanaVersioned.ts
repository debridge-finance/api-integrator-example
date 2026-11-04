import 'dotenv/config';
import bs58 from 'bs58';
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  MessageV0,
  MessageV1,
  PACKET_DATA_SIZE,
  VersionedTransaction,
} from "web3js-v3"; // @solana/web3.js v3, installed under an alias (see README "Solana Transaction Versions")

/**
 * Helpers for Solana transactions returned by the deBridge API, for BOTH formats the API can build:
 *
 *   - v0 (`solanaTransactionVersion=0`, the default): address lookup tables, 1232-byte limit,
 *     compute budget set through the two ComputeBudget instructions the API prepends.
 *   - v1 (`solanaTransactionVersion=1`, SIMD-0385): no lookup tables, 4096-byte limit,
 *     compute budget carried in the message config (priority fee in lamports, CU limit,
 *     loaded-accounts-data limit). Any ComputeBudget instruction left in a v1 payload is a no-op.
 *
 * Flow: decode -> fresh blockhash -> simulate -> compute budget -> sign -> broadcast (fire-and-forget, like utils/solana.ts).
 *
 * Why web3.js v3: v1.x can deserialize v1 transactions but cannot serialize or sign them.
 */

/** Max wire size of a SIMD-0385 v1 transaction. v0 stays at PACKET_DATA_SIZE (1232). */
export const V1_TRANSACTION_SIZE_LIMIT = 4096;

/** Compute-budget tuning applied before signing. */
export type ComputeBudgetOptions = {
  /** Keep the CU limit / priority fee exactly as the API returned them and skip the simulation. Default: false. */
  keepApiComputeBudget?: boolean;
  /** Multiplier on the simulated CU usage. Default: 1.1 (10% headroom). */
  computeUnitBuffer?: number;
  /** Used when the simulation does not report consumed units. Default: 200_000. */
  fallbackComputeUnits?: number;
  /** Used when the RPC returns no recent prioritization fees. Default: 2_000 micro-lamports per CU. */
  fallbackMicroLamportsPerCu?: number;
};

export type ComputeBudget = {
  computeUnitLimit: number;
  /** Priority fee price, in micro-lamports per compute unit (the v0 unit). For v1 it is converted to total lamports. */
  microLamportsPerCu: number;
};

/** web3.js v3 derives key pairs through WebCrypto, so loading a Keypair is async. */
export async function getSolanaKeypair(solPrivateKey: string): Promise<Keypair> {
  return Keypair.fromSecretKey(bs58.decode(solPrivateKey));
}

/** Decode the `tx.data` hex string returned by /dln/order/create-tx or /chain/transaction. Works for v0 and v1. */
export function deserializeSolanaTransaction(txData: string): VersionedTransaction {
  const hex = txData.startsWith("0x") ? txData.slice(2) : txData;
  return VersionedTransaction.deserialize(Buffer.from(hex, "hex"));
}

/** One-line summary of a transaction, useful to compare the two formats side by side. */
export function describeSolanaTransaction(tx: VersionedTransaction): string {
  const message = tx.message;
  const size = tx.serialize().length;
  const limit = tx.version === 1 ? V1_TRANSACTION_SIZE_LIMIT : PACKET_DATA_SIZE;
  const lookups = message instanceof MessageV0 ? message.addressTableLookups.length : 0;
  const config = message instanceof MessageV1 ? `, config=${JSON.stringify(message.transactionConfig ?? {}, bigintReplacer)}` : "";

  return `version=${String(tx.version)}, size=${size}/${limit} bytes, ${message.staticAccountKeys.length} static accounts, ` +
    `${lookups} lookup tables, ${message.compiledInstructions.length} instructions${config}`;
}

/**
 * Decode, refresh the blockhash, simulate, set the compute budget and sign. Version-aware.
 * @param connection Solana RPC connection (web3.js v3).
 * @param txData `tx.data` from the deBridge API response.
 * @param solWallet Signer (fee payer / sender used in the API call).
 * @param options Compute-budget tuning, see ComputeBudgetOptions.
 * @returns A signed transaction ready for broadcastSolanaTransaction.
 */
export async function prepareVersionedSolanaTransaction(
  connection: Connection,
  txData: string,
  solWallet: Keypair,
  options: ComputeBudgetOptions = {},
): Promise<VersionedTransaction> {
  const tx = deserializeSolanaTransaction(txData);
  console.log(`\nDecoded Solana transaction from the API: ${describeSolanaTransaction(tx)}`);

  if (!(tx.message instanceof MessageV0) && !(tx.message instanceof MessageV1)) {
    throw new Error(`Unsupported Solana message version: ${String(tx.version)}`);
  }

  // The API returns a placeholder blockhash; set a fresh one before simulating and signing.
  const { blockhash } = await connection.getLatestBlockhash();
  tx.message.recentBlockhash = blockhash;

  if (options.keepApiComputeBudget) {
    console.log("Keeping the compute budget as returned by the API.");
  } else {
    const computeUnitLimit = await estimateComputeUnitLimit(connection, tx, options);
    const microLamportsPerCu = await getMedianPriorityFee(connection, options);
    applyComputeBudget(tx, { computeUnitLimit, microLamportsPerCu });
  }

  await tx.sign([solWallet]); // async in web3.js v3
  console.log(`Signed Solana transaction: ${describeSolanaTransaction(tx)}`);

  return tx;
}

/**
 * Write the compute budget into the transaction, in the way each format expects it.
 * v1: message config (CU limit + priority fee in lamports). v0: patch the ComputeBudget instructions in place.
 */
export function applyComputeBudget(tx: VersionedTransaction, budget: ComputeBudget): void {
  const message = tx.message;

  if (message instanceof MessageV1) {
    // SIMD-0385: the runtime reads the budget from the config mask, not from ComputeBudget instructions.
    // The priority fee is a TOTAL in lamports, so convert from the per-CU price used by v0.
    const priorityFeeLamports = BigInt(Math.ceil((budget.computeUnitLimit * budget.microLamportsPerCu) / 1_000_000));
    message.transactionConfig = {
      ...message.transactionConfig, // keeps loadedAccountsDataSizeLimit / heapSize as set by the API
      computeUnitLimit: budget.computeUnitLimit,
      priorityFeeLamports,
    };
    console.log(`v1 compute budget: CU limit ${budget.computeUnitLimit}, priority fee ${priorityFeeLamports} lamports ` +
      `(${budget.microLamportsPerCu} micro-lamports/CU)`);
    return;
  }

  if (message instanceof MessageV0) {
    // The API prepends SetComputeUnitLimit (discriminator 2, u32) and SetComputeUnitPrice (discriminator 3, u64).
    // Instruction data layout: 1-byte discriminator followed by the little-endian value.
    let patched = 0;
    for (const ix of message.compiledInstructions) {
      const program = message.staticAccountKeys[ix.programIdIndex];
      if (!program || !program.equals(ComputeBudgetProgram.programId)) continue;

      const view = new DataView(ix.data.buffer, ix.data.byteOffset, ix.data.byteLength);
      if (ix.data[0] === 2 && ix.data.length >= 5) {
        view.setUint32(1, budget.computeUnitLimit, true);
        patched++;
      } else if (ix.data[0] === 3 && ix.data.length >= 9) {
        view.setBigUint64(1, BigInt(budget.microLamportsPerCu), true);
        patched++;
      }
    }
    if (patched !== 2) {
      console.warn(`Expected to patch 2 ComputeBudget instructions in the v0 transaction, patched ${patched}.`);
    }
    console.log(`v0 compute budget: CU limit ${budget.computeUnitLimit}, CU price ${budget.microLamportsPerCu} micro-lamports/CU`);
    return;
  }

  throw new Error("Legacy Solana messages are not produced by the deBridge API.");
}

/**
 * Serialize and broadcast a signed transaction. Fire-and-forget: the signature is printed with a Solscan link,
 * no confirmation is awaited (same approach as utils/solana.ts). `sendRawTransaction` base64-encodes the wire
 * bytes, which v1 transactions above 1232 bytes require (base58 submission is capped at 1232 bytes).
 */
export async function broadcastSolanaTransaction(
  connection: Connection,
  tx: VersionedTransaction,
  options: { skipPreflight?: boolean } = {},
): Promise<string> {
  const raw = tx.serialize();
  const limit = tx.version === 1 ? V1_TRANSACTION_SIZE_LIMIT : PACKET_DATA_SIZE;
  if (raw.length > limit) {
    throw new Error(`Serialized transaction is ${raw.length} bytes, above the ${limit}-byte limit for version ${String(tx.version)}.`);
  }

  console.log(`Broadcasting ${raw.length}-byte version ${String(tx.version)} transaction...`);
  const signature = await connection.sendRawTransaction(raw, { skipPreflight: options.skipPreflight ?? false });
  console.log(`✅ Transaction sent! Signature: ${signature}`);
  console.log(`🎉 Check tx on solscan: \n https://solscan.io/tx/${signature}`);

  return signature;
}

// --- internals ---

async function estimateComputeUnitLimit(connection: Connection, tx: VersionedTransaction, options: ComputeBudgetOptions): Promise<number> {
  // Simulate unsigned (sigVerify: false) with the blockhash already set on the message.
  const simulation = await connection.simulateTransaction(tx, { sigVerify: false, commitment: "confirmed" });
  if (simulation.value.err) {
    // RPC error objects contain BigInts (e.g. instruction index, custom error code), hence the replacer.
    const err = JSON.stringify(simulation.value.err, bigintReplacer);
    console.error("Simulation failed:", err);
    console.error("Simulation logs:\n" + (simulation.value.logs ?? []).join("\n"));
    throw new Error(`Solana transaction simulation failed, not broadcasting: ${err}`);
  }

  const used = simulation.value.unitsConsumed !== undefined && simulation.value.unitsConsumed !== null
    ? Number(simulation.value.unitsConsumed)
    : (options.fallbackComputeUnits ?? 200_000);
  const limit = Math.ceil(used * (options.computeUnitBuffer ?? 1.1));
  console.log(`Simulation OK: ${used} CU consumed, setting CU limit to ${limit}`);
  return limit;
}

async function getMedianPriorityFee(connection: Connection, options: ComputeBudgetOptions): Promise<number> {
  const recent = await connection.getRecentPrioritizationFees();
  const fees = recent.map((f) => Number(f.prioritizationFee)).sort((a, b) => a - b);
  if (fees.length === 0) return options.fallbackMicroLamportsPerCu ?? 2_000;
  return fees[Math.floor(fees.length / 2)];
}

function bigintReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}
