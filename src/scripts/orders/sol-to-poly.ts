import 'dotenv/config';
import {
  ethers,
  Wallet,
  TransactionRequest
} from "ethers";
import { VersionedTransaction, Connection, Keypair } from "@solana/web3.js";
import bs58 from 'bs58';
import { createDebridgeBridgeOrder } from '../../utils/deBridge/createDeBridgeOrder';
import { deBridgeOrderInput } from '../../types';
import { getEnvConfig, updatePriorityFee } from '../../utils';
import { EVM_NATIVE_TOKEN, SOL } from '../../utils/tokens';
import { prepareSolanaTransaction } from '../../utils/solana';
import { CHAIN_IDS } from '../../utils/chains';

async function main() {
  const { privateKey, solPrivateKey, solRpcUrl } = getEnvConfig();

  // --- Wallet and Signer Setup ---
  const wallet = new Wallet(privateKey);
  const evmUserAddress = wallet.address;
  const solWallet = Keypair.fromSecretKey(bs58.decode(solPrivateKey));

  console.log(`\nSOL address (sender): ${solWallet.publicKey.toBase58()}`)
  console.log(`\nEVM address (recipient): ${evmUserAddress}`);

  // --- Prepare deBridge Order ---
  const solDecimals = 9;
  const amountToSend = "0.01"; // The amount of SOL to send

  // Affiliate fee parameters
  const affiliateFeePercent = 0.1; // 0.1% affiliate fee
  const affiliateFeeRecipient = "862oLANNqhdXyUCwLJPBqUHrScrqNR4yoGWGTxjZftKs"; // DevRel Solana address

  const amountInAtomicUnit = ethers.parseUnits(amountToSend, solDecimals);

  const orderInput: deBridgeOrderInput = {
    srcChainId: CHAIN_IDS.Solana.toString(),
    srcChainTokenIn: SOL.nativeSol, // SOL native token
    srcChainTokenInAmount: amountInAtomicUnit.toString(),
    dstChainId: CHAIN_IDS.Polygon.toString(),
    dstChainTokenOut: EVM_NATIVE_TOKEN.address, // Polygon native token
    dstChainTokenOutRecipient: evmUserAddress,
    account: solWallet.publicKey.toBase58(),
    srcChainOrderAuthorityAddress: solWallet.publicKey.toBase58(),
    dstChainOrderAuthorityAddress: evmUserAddress,
    affiliateFeePercent,
    affiliateFeeRecipient
  };

  console.log("\nCreating deBridge order with input:", JSON.stringify(orderInput, null, 2));
  const order = await createDebridgeBridgeOrder(orderInput);

  if (!order || !order.tx || !order.tx.data) {
    throw new Error("Invalid transaction request object from createDebridgeBridgeOrder.");
  }

  console.log("\nOrder Estimation:", order.estimation);
  const transactionRequest: TransactionRequest = order.tx;
  console.log("\nTransaction Request Object:", transactionRequest);

  const signedTx = await prepareSolanaTransaction(solRpcUrl, order.tx.data, solWallet);
  const connection = new Connection(solRpcUrl, { commitment: "confirmed" });

  // --- Send Main Bridge Transaction on Solana ---
  try {
    console.log("\n--- Sending deBridge tx on Solana ---");
    // serialize and send raw VersionedTransaction
    const raw = signedTx.serialize();
    const signature = await connection.sendRawTransaction(raw, { skipPreflight: false });
    console.log(`✅ Transaction sent! Signature: ${signature}`);

    console.log(`🎉 Check tx on solscan: \n https://solscan.io/tx/${signature}`);
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