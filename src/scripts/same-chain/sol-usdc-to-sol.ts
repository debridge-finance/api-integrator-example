import 'dotenv/config';
import {
  ethers,
  Wallet,
  TransactionRequest
} from "ethers";
import { VersionedTransaction, Connection, Keypair } from "@solana/web3.js";
import bs58 from 'bs58';
import { SameChainSwapInput } from '../../types';
import { getEnvConfig, updatePriorityFee } from '../../utils';
import { createDeBridgeSameChainSwap } from '../../utils/deBridge/sameChainSwap';

async function main() {
  const { privateKey, solPrivateKey, solRpcUrl } = getEnvConfig();

  // --- Wallet and Signer Setup ---
  const wallet = new Wallet(privateKey);
  const evmUserAddress = wallet.address;
  const solWallet = Keypair.fromSecretKey(bs58.decode(solPrivateKey));

  console.log(`\nSOL address (sender): ${solWallet.publicKey.toBase58()}`)
  console.log(`\nEVM address (recipient): ${evmUserAddress}`);

  // --- Prepare deBridge Order ---
  const solNativeAddress = '11111111111111111111111111111111';
  const solUsdcAddress = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
  const usdcDecimals = 6; // Polygon and Arbitrum USDC have 6 decimals, as typical. Solana too. 
  const amountToSend = "0.2"; // The amount of USDC to send

  const amountInAtomicUnit = ethers.parseUnits(amountToSend, usdcDecimals);

  const sameChainSwapInput: SameChainSwapInput = {
    chainId: '7565164',
    tokenIn: solUsdcAddress,
    tokenInAmount: amountInAtomicUnit.toString(),
    tokenOut: solNativeAddress,
    tokenOutRecipient: solWallet.publicKey.toBase58(),
    senderAddress: solWallet.publicKey.toBase58(),
  };

  console.log("\nCreating deBridge order with input:", JSON.stringify(sameChainSwapInput, null, 2));
  const swap = await createDeBridgeSameChainSwap(sameChainSwapInput);

  if (!swap || !swap.tx || !swap.tx.data) {
    throw new Error("Invalid transaction request object from createDeBridgeSameChainSwap.");
  }

  console.log("\nOrder Estimation:", swap);
  const transactionRequest: TransactionRequest = swap.tx;
  console.log("\nTransaction Request Object:", transactionRequest);

  const connection = new Connection(solRpcUrl, { commitment: "confirmed" });
  const tx = VersionedTransaction.deserialize(Buffer.from(swap.tx.data.slice(2), "hex"));

  const latestBlockhash = await connection.getLatestBlockhash();
  tx.message.recentBlockhash = latestBlockhash.blockhash; // Update blockhash!
  tx.sign([solWallet]); // Sign the tx with wallet

  const simulatedTx = await connection.simulateTransaction(tx);
  const used = simulatedTx.value.unitsConsumed ?? 200_000; // fallback if missing
  const NEW_CU_LIMIT = Math.ceil(used * 1.1); // Add a 10% buffer

  const feeHistory = await connection.getRecentPrioritizationFees();
  const fees = feeHistory.map(f => f.prioritizationFee);

  let suggestedFee: number;
  if (fees.length === 0) {
    suggestedFee = 2_000;               // fallback if RPC returns nothing
  } else {
    // sort ascending
    fees.sort((a, b) => a - b);
    // take middle element
    suggestedFee = fees[Math.floor(fees.length / 2)];
  }

  const NEW_CU_PRICE = suggestedFee;

  updatePriorityFee(tx, NEW_CU_PRICE, NEW_CU_LIMIT);
  const { blockhash } = await connection.getLatestBlockhash();
  tx.message.recentBlockhash = blockhash; // Update blockhash!
  tx.sign([solWallet]); // Sign the tx with wallet

  // --- Send Main Transaction on Solana ---
  try {
    console.log("\n--- Sending deBridge tx on Solana ---");
    // serialize and send raw VersionedTransaction
    const raw = tx.serialize();
    const signature = await connection.sendRawTransaction(raw, { skipPreflight: false });
    console.log(`✅ Transaction sent! Signature: ${signature}`);

    console.log(`🎉 Check solana tx for success by using an explorer. \n${signature}`);
  } catch (err) {
    console.error("\n🚨 Error sending or confirming Solana transaction:");
    console.error(err);
    process.exitCode = 1;
  }

  console.log("\n--- Script finished ---");

} // end main function

// Execute main function and catch any top-level errors
main().catch((error) => {
  // Avoid double-logging errors already caught and re-thrown inside main
  if (!(error instanceof Error && error.message.includes("Token approval failed"))) {
    console.error("\n🚨 FATAL ERROR in script execution:", error);
  }
  process.exitCode = 1;
});