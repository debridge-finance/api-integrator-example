import { getAddress, TransactionReceipt, TransactionRequest, TransactionResponse, Wallet } from "ethers";
import { getEnvConfig, getJsonRpcProviders } from "../../../utils";
import { getCancelOrderTx } from "../../../utils/deBridge";

async function main() {
  const orderId = "0xc0b6853690f085eb232c47b57fe8aebb38e2426f391b0805094910f1863cec46"; // The orderId you wish to cancel 
  /**
   * NOTE: Easy way to get the order Id while testing is to create a stuck order by calling src/scripts/orders/cancellation/stuck-order-sol-to-poly.ts.
   * The script will output the tx hash - paste that hash into deBridge explorer - https://app.debridge.com/orders
   * The order will be shown on screen, and you can easily find the orderId from the URL
   * 
   * Example: https://app.debridge.finance/orders?s=5uBRGndnoMRu4Byy2rD8NNQPkZ2uHp6DBUBfpqttgtXXAqWP3PsAYafN7VhPXwXzFG4GXowdtigH75KhLCh9m1ny - find with hash
   * Example: https://app.debridge.finance/order?orderId=0xc0b6853690f085eb232c47b57fe8aebb38e2426f391b0805094910f1863cec46 - orderId clearly marked
   */

  const cancelTx = await getCancelOrderTx(orderId);

  const { privateKey } = getEnvConfig();

  const { polygonProvider } = await getJsonRpcProviders();

  // --- Wallet and Signer Setup ---
  const wallet = new Wallet(privateKey);
  const signer = wallet.connect(polygonProvider);
  const senderAddress = await signer.getAddress();

  const network = await signer.provider.getNetwork();

  if (BigInt(cancelTx.chainId) !== network.chainId) {
    throw new Error(`Expected wallet on chain ${cancelTx.chainId} but got ${network.chainId}`);
  }

  if (getAddress(senderAddress) !== getAddress(cancelTx.from)) {
    throw new Error("Sender not matching the order destination chain authority address");
  }

  const tx: TransactionRequest = {
    to: cancelTx.to,
    value: cancelTx.value,
    data: cancelTx.data
  };

  console.log("\nTransaction Request Object:", tx);

  // Estimate gas
  try {
    const estimateGasResponse = await signer.estimateGas(tx);

    // Add 30% buffer
    tx.gasLimit = (estimateGasResponse * 130n) / 100n;
  } catch (error) {
    console.error("\n🚨 Error estimating gas for the transaction:");
    if (error instanceof Error) { console.error(` Message: ${error.message}`); }
    else { console.error(" An unexpected error occurred:", error); }
    process.exitCode = 1; // Indicate failure
  }

  // Sending the tx
  try {
    console.log("\n--- Sending Cancel Order Transaction ---");

    const txResponse: TransactionResponse = await signer.sendTransaction(tx);

    console.log(`Transaction sent successfully!`);
    console.log(` --> Transaction Hash: ${txResponse.hash}`);
    console.log(` --> View on Polygonscan: https://polygonscan.com/tx/${txResponse.hash}`);

    console.log("\nWaiting for transaction to be mined (awaiting 1 confirmation)...");
    const txReceipt: TransactionReceipt | null = await txResponse.wait();

    if (txReceipt) {
      console.log("\nTransaction mined successfully!");
      console.log(` Status: ${txReceipt.status === 1 ? '✅ Success' : '❌ Failed'}`);
      console.log(` Block number: ${txReceipt.blockNumber}`);
      console.log(` Gas used: ${txReceipt.gasUsed.toString()}`);
    } else {
      console.error("Transaction receipt was null. Transaction might have been dropped or replaced.");
      console.error("Check the explorer link above for the final status of the hash:", txResponse.hash);
    }

  } catch (error) {
    console.error("\n🚨 Error sending or waiting for the transaction:");
    if (error instanceof Error) { console.error(` Message: ${error.message}`); }
    else { console.error(" An unexpected error occurred:", error); }
    process.exitCode = 1; // Indicate failure
  }

  console.log("\n--- Script finished ---");
  process.exitCode = 0;
}

// Execute main function and catch any top-level errors
main().catch((error) => {
  // Avoid double-logging errors already caught and re-thrown inside main
  if (!(error instanceof Error && error.message.includes("Token approval failed"))) {
    console.error("\n🚨 FATAL ERROR in script execution:", error);
  }
  process.exitCode = 1;
});