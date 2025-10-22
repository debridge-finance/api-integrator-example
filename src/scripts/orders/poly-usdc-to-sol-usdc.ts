import 'dotenv/config';
import {
  ethers,
  Wallet,
  TransactionResponse,
  TransactionReceipt, 
  TransactionRequest
} from "ethers";
import { createDebridgeBridgeOrder } from '../../utils/deBridge/createDeBridgeOrder';
import { deBridgeOrderInput } from '../../types';
import { getEnvConfig, getJsonRpcProviders } from '../../utils';
import { USDC } from '../../utils/tokens';
import { CHAIN_IDS } from '../../utils/chains';

async function main() {
  const { privateKey } = getEnvConfig();

  const { polygonProvider } = await getJsonRpcProviders();

  // --- Wallet and Signer Setup ---
  const wallet = new Wallet(privateKey);
  const signer = wallet.connect(polygonProvider);
  const senderAddress = await signer.getAddress();
  console.log(`\nWallet Address (Signer): ${senderAddress}`);

  // --- Prepare deBridge Order ---
  const usdcDecimals = 6; // Polygon and Arbitrum USDC have 6 decimals, as typical
  const amountToSend = "0.2"; // The amount of USDC to send
  const solUserAddress = "862oLANNqhdXyUCwLJPBqUHrScrqNR4yoGWGTxjZftKs"

  const amountInAtomicUnit = ethers.parseUnits(amountToSend, usdcDecimals);

  const orderInput: deBridgeOrderInput = {
    srcChainId: CHAIN_IDS.Polygon.toString(),
    srcChainTokenIn: USDC.POLYGON,
    srcChainTokenInAmount: amountInAtomicUnit.toString(),
    dstChainId: CHAIN_IDS.Solana.toString(),
    dstChainTokenOut: USDC.SOLANA,
    dstChainTokenOutRecipient: solUserAddress,
    account: senderAddress,
    srcChainOrderAuthorityAddress: wallet.address,
    dstChainOrderAuthorityAddress: solUserAddress,
    affiliateFeePercent: 0.1,
    affiliateFeeRecipient: wallet.address,
  };

  console.log("\nCreating deBridge order with input:", JSON.stringify(orderInput, null, 2));
  const order = await createDebridgeBridgeOrder(orderInput);

  if (!order || !order.tx || !order.tx.to || !order.tx.data) {
    throw new Error("Invalid transaction request object from createDebridgeBridgeOrder.");
  }

  console.log("\nOrder Estimation:", order.estimation);
  const transactionRequest: TransactionRequest = order.tx;
  console.log("\nTransaction Request Object:", transactionRequest);

  // --- Approve Token Spending ---
  const spenderAddress = transactionRequest.to; // The deBridge contract address needing approval
  if (!spenderAddress) {
    throw new Error("Transaction request is missing the 'to' address (spender).");
  }

  // --- Send Main Bridge Transaction ---
  // This part only runs if the approval check/transaction above was successful
  try {
    console.log("\n--- Sending Main Bridge Transaction ---");
    console.log("Submitting the deBridge transaction request...");

    const txResponse: TransactionResponse = await signer.sendTransaction(transactionRequest);

    console.log(`Main transaction sent successfully!`);
    console.log(` --> Transaction Hash: ${txResponse.hash}`);
    console.log(` --> View on Polygonscan: https://polygonscan.com/tx/${txResponse.hash}`);

    console.log("\nWaiting for main transaction to be mined (awaiting 1 confirmation)...");
    const txReceipt: TransactionReceipt | null = await txResponse.wait();

    if (txReceipt) {
      console.log("\nMain transaction mined successfully!");
      console.log(` Status: ${txReceipt.status === 1 ? '✅ Success' : '❌ Failed'}`);
      console.log(` Block number: ${txReceipt.blockNumber}`);
      console.log(` Gas used: ${txReceipt.gasUsed.toString()}`);
    } else {
      console.error("Main transaction receipt was null. Transaction might have been dropped or replaced.");
      console.error("Check the explorer link above for the final status of the hash:", txResponse.hash);
    }

  } catch (error) {
    console.error("\n🚨 Error sending or waiting for the main transaction:");
    if (error instanceof Error) { console.error(` Message: ${error.message}`); }
    else { console.error(" An unexpected error occurred:", error); }
    process.exitCode = 1; // Indicate failure
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