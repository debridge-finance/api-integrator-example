import 'dotenv/config';
import { VersionedTransaction, Connection, Keypair } from "@solana/web3.js";
import { updatePriorityFee } from ".";

/**
 * This function will simulate a Solana transaction, set appropriate priority fees, blockchash, and sign it.
 * @param solRpcUrl RPC URL of the Solana network.
 * @param txData What to execute. 
 * @param solWallet Signer keypair.
 * @returns A signed Solana transaction ready for submission.
 */
export async function prepareSolanaTransaction(solRpcUrl: string, txData: string, solWallet: Keypair) {
  const connection = new Connection(solRpcUrl, { commitment: "confirmed" });
  const tx = VersionedTransaction.deserialize(Buffer.from(txData.slice(2), "hex"));

  const latestBlockhash = await connection.getLatestBlockhash();
  tx.message.recentBlockhash = latestBlockhash.blockhash; // Update the blockhash for simulation!
  tx.sign([solWallet]); // Sign the tx with wallet

  const simulatedTx = await connection.simulateTransaction(tx);
  const used = simulatedTx.value.unitsConsumed ?? 200_000; // fallback if missing
  const NEW_CU_LIMIT = Math.ceil(used * 1.1); // Add a 10% buffer

  const feeHistory = await connection.getRecentPrioritizationFees();
  const fees = feeHistory.map(f => f.prioritizationFee);

  let suggestedFee: number;
  if (fees.length === 0) {
    suggestedFee = 2_000; // fallback if RPC returns nothing
  } else {
    // sort ascending
    fees.sort((a, b) => a - b);
    // take middle element
    suggestedFee = fees[Math.floor(fees.length / 2)];
  }

  const NEW_CU_PRICE = suggestedFee;

  updatePriorityFee(tx, NEW_CU_PRICE, NEW_CU_LIMIT);

  const { blockhash } = await connection.getLatestBlockhash();
  tx.message.recentBlockhash = blockhash; // Update the blockhash again!
  
  tx.sign([solWallet]); // Sign the tx with wallet
  
  return tx;
}