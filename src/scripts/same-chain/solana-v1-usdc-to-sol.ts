import 'dotenv/config';
import { ethers } from "ethers";
import { Connection } from "web3js-v3"; // @solana/web3.js v3 under an alias, see README "Solana Transaction Versions"
import { SameChainSwapInput, SolanaTransactionVersion } from '../../types';
import { getEnvConfig } from '../../utils';
import { createDeBridgeSameChainSwap } from '../../utils/deBridge/sameChainSwap';
import { SOL, USDC } from '../../utils/tokens';
import { CHAIN_IDS } from '../../utils/chains';
import { broadcastSolanaTransaction, getSolanaKeypair, prepareVersionedSolanaTransaction } from '../../utils/solanaVersioned';

/**
 * Same-chain swap on Solana (USDC -> SOL) using the `solanaTransactionVersion` API parameter.
 *
 * 1 asks the API for a SIMD-0385 "v1" transaction (inline addresses, 4096-byte limit, compute budget in the message config).
 * 0 asks for the classic v0 format (address lookup tables, 1232-byte limit, ComputeBudget instructions).
 * 
 * Example transaction: https://solscan.io/tx/66RjhGbPQvom5tcCUMoaSSfA5WMqQswuPYPSJqpTmeNv6xMhbrRKk5E6N6eRNKLgEGGEczCCB6cBqzkiNDjkt4vt
 */
const SOLANA_TX_VERSION: SolanaTransactionVersion = 1;

async function main() {
  const { solPrivateKey, solRpcUrl } = getEnvConfig();

  // --- Wallet Setup (Keypair.fromSecretKey is async in web3.js v3) ---
  const solWallet = await getSolanaKeypair(solPrivateKey);
  console.log(`\nSOL address (sender & recipient): ${solWallet.publicKey.toBase58()}`);

  // --- Prepare deBridge Same-Chain Swap ---
  const usdcDecimals = 6; // Solana USDC has 6 decimals
  const amountToSend = "0.2"; // The amount of USDC to swap

  const amountInAtomicUnit = ethers.parseUnits(amountToSend, usdcDecimals);

  const sameChainSwapInput: SameChainSwapInput = {
    chainId: CHAIN_IDS.Solana.toString(),
    tokenIn: USDC.SOLANA,
    tokenInAmount: amountInAtomicUnit.toString(),
    tokenOut: SOL.nativeSol,
    tokenOutRecipient: solWallet.publicKey.toBase58(),
    senderAddress: solWallet.publicKey.toBase58(),
    solanaTransactionVersion: SOLANA_TX_VERSION,
  };

  console.log("\nCreating deBridge same-chain swap with input:", JSON.stringify(sameChainSwapInput, null, 2));
  const swap = await createDeBridgeSameChainSwap(sameChainSwapInput);

  if (!swap || !swap.tx || !swap.tx.data) {
    throw new Error("Invalid transaction request object from createDeBridgeSameChainSwap.");
  }

  console.log("\nSwap Estimation:", {
    tokenIn: swap.tokenIn,
    tokenOut: swap.tokenOut,
    slippage: swap.slippage,
    estimatedTransactionFee: swap.estimatedTransactionFee,
  });

  // --- Decode, simulate, set compute budget, sign (version-aware) ---
  const connection = new Connection(solRpcUrl, { commitment: "confirmed" });
  const signedTx = await prepareVersionedSolanaTransaction(connection, swap.tx.data, solWallet);

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
