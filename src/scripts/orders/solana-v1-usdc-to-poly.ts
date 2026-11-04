import 'dotenv/config';
import { ethers, Wallet } from "ethers";
import { Connection } from "web3js-v3"; // @solana/web3.js v3 under an alias, see README "Solana Transaction Versions"
import { createDebridgeBridgeOrder } from '../../utils/deBridge/createDeBridgeOrder';
import { deBridgeOrderInput, SolanaTransactionVersion } from '../../types';
import { getEnvConfig } from '../../utils';
import { USDC } from '../../utils/tokens';
import { CHAIN_IDS } from '../../utils/chains';
import { broadcastSolanaTransaction, getSolanaKeypair, prepareVersionedSolanaTransaction } from '../../utils/solanaVersioned';

/**
 * Cross-chain order Solana USDC -> Polygon USDC using the `solanaTransactionVersion` API parameter.
 *
 * 1 asks the API for a SIMD-0385 "v1" transaction (inline addresses, 4096-byte limit, compute budget in the message config).
 * 0 asks for the classic v0 format (address lookup tables, 1232-byte limit, ComputeBudget instructions).
 * 
 * Example: https://app.debridge.com/order?orderId=0x47d9d5417d79365406d3fb5781349fe9aa569df181f7007644fe87c5d17b0ee6
 */
const SOLANA_TX_VERSION: SolanaTransactionVersion = 1;

async function main() {
  const { privateKey, solPrivateKey, solRpcUrl } = getEnvConfig();

  // --- Wallet and Signer Setup (Keypair.fromSecretKey is async in web3.js v3) ---
  const wallet = new Wallet(privateKey);
  const evmUserAddress = wallet.address;
  const solWallet = await getSolanaKeypair(solPrivateKey);

  console.log(`\nSOL address (sender): ${solWallet.publicKey.toBase58()}`);
  console.log(`\nEVM address (recipient): ${evmUserAddress}`);

  // --- Prepare deBridge Order ---
  const usdcDecimals = 6; // Polygon and Solana USDC have 6 decimals
  const amountToSend = "1.2"; // The amount of USDC to send

  const amountInAtomicUnit = ethers.parseUnits(amountToSend, usdcDecimals);

  const orderInput: deBridgeOrderInput = {
    srcChainId: CHAIN_IDS.Solana.toString(),
    srcChainTokenIn: USDC.SOLANA,
    srcChainTokenInAmount: amountInAtomicUnit.toString(),
    dstChainId: CHAIN_IDS.Polygon.toString(),
    dstChainTokenOut: USDC.POLYGON,
    dstChainTokenOutRecipient: evmUserAddress,
    account: solWallet.publicKey.toBase58(),
    srcChainOrderAuthorityAddress: solWallet.publicKey.toBase58(),
    dstChainOrderAuthorityAddress: evmUserAddress,
    solanaTransactionVersion: SOLANA_TX_VERSION,
  };

  console.log("\nCreating deBridge order with input:", JSON.stringify(orderInput, null, 2));
  const order = await createDebridgeBridgeOrder(orderInput);

  if (!order || !order.tx || !order.tx.data) {
    throw new Error("Invalid transaction request object from createDebridgeBridgeOrder.");
  }

  console.log("\nOrder Estimation:", order.estimation);
  console.log("\nEstimated transaction fee:", order.estimatedTransactionFee);

  // --- Decode, simulate, set compute budget, sign (version-aware) ---
  const connection = new Connection(solRpcUrl, { commitment: "confirmed" });
  const signedTx = await prepareVersionedSolanaTransaction(connection, order.tx.data, solWallet);

  // --- Broadcast on Solana (fire-and-forget, check the Solscan link) ---
  try {
    console.log(`\n--- Sending deBridge v${SOLANA_TX_VERSION} tx on Solana ---`);
    await broadcastSolanaTransaction(connection, signedTx);
  } catch (err) {
    console.error("\n🚨 Error sending Solana transaction:");
    console.error(err);
    process.exitCode = 1;
  }

  console.log("\n--- Script finished ---");

} // end main function

// Execute main function and catch any top-level errors
main().catch((error) => {
  console.error("\n🚨 FATAL ERROR in script execution:", error);
  process.exitCode = 1;
});
