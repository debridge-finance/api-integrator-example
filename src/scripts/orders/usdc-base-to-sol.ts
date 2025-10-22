import 'dotenv/config';
import {
  ethers,
  Wallet,
  Contract,
  formatUnits,
  TransactionResponse,
  TransactionReceipt, 
  TransactionRequest
} from "ethers";
import { createDebridgeBridgeOrder } from '../../utils/deBridge/createDeBridgeOrder';
import { deBridgeOrderInput } from '../../types';
import { erc20Abi } from '../../constants';
import { getEnvConfig, getJsonRpcProviders } from '../../utils';
import { SOL, USDC } from '../../utils/tokens';

async function main() {
  const { privateKey } = getEnvConfig();

  const { polygonProvider } = await getJsonRpcProviders();

  // --- Wallet and Signer Setup ---
  const wallet = new Wallet(privateKey);
  const signer = wallet.connect(polygonProvider);
  const senderAddress = await signer.getAddress();
  console.log(`\nWallet Address (Signer): ${senderAddress}`);

  // --- Prepare deBridge Order ---
  const usdcDecimals = 6; // Base USDC has 6 decimals, as typical
  const amountToSend = "0.2"; // The amount of USDC to send
  const solUserAddress = "862oLANNqhdXyUCwLJPBqUHrScrqNR4yoGWGTxjZftKs"

  const amountInAtomicUnit = ethers.parseUnits(amountToSend, usdcDecimals);

  const orderInput: deBridgeOrderInput = {
    srcChainId: '8453',
    srcChainTokenIn: USDC.BASE,
    srcChainTokenInAmount: amountInAtomicUnit.toString(),
    dstChainId: '7565164',
    dstChainTokenOut: SOL.nativeSol,
    dstChainTokenOutRecipient: solUserAddress,
    account: senderAddress,
    srcChainOrderAuthorityAddress: wallet.address,
    dstChainOrderAuthorityAddress: solUserAddress,
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

  console.log(`\n--- Checking/Setting Token Approval ---`);
  console.log(` Token to approve: ${orderInput.srcChainTokenIn} (Polygon USDC)`);
  console.log(` Spender address: ${spenderAddress}`);
  console.log(` Amount required: ${formatUnits(amountInAtomicUnit, usdcDecimals)} USDC`);

  // Create a contract instance for the token, connected to the signer
  const tokenContract = new Contract(orderInput.srcChainTokenIn, erc20Abi, signer);
  const requiredAmountBigInt = BigInt(order.estimation.srcChainTokenIn.amount);

  try {
    console.log(`Checking current allowance...`);
    const currentAllowance: bigint = await tokenContract.allowance(senderAddress, spenderAddress);
    console.log(` Current allowance: ${formatUnits(currentAllowance, usdcDecimals)} USDC`);

    // Check if current allowance is less than the required amount
    if (currentAllowance < requiredAmountBigInt) {
      console.log("Allowance is insufficient. Sending approve transaction...");

      // Send the approve transaction
      const approveTxResponse: TransactionResponse = await tokenContract.approve(spenderAddress, requiredAmountBigInt);

      console.log(`Approve transaction sent!`);
      console.log(` --> Transaction Hash: ${approveTxResponse.hash}`);
      console.log(` --> View on Basescan: https://basescan.com/tx/${approveTxResponse.hash}`);
      console.log("Waiting for approve transaction to be mined (awaiting 1 confirmation)...");

      // Wait for the approve transaction to be mined
      const approveTxReceipt: TransactionReceipt | null = await approveTxResponse.wait();

      if (approveTxReceipt && approveTxReceipt.status === 1) {
        console.log("Approve transaction mined successfully! ✅");
      } else {
        // Throw an error if the approve transaction failed
        throw new Error(`Approve transaction failed or receipt not found. Status: ${approveTxReceipt?.status}`);
      }
    } else {
      console.log("Sufficient allowance already granted. Skipping approve transaction. 👍");
    }

  } catch (error) {
    console.error("\n🚨 Error during token approval process:");
    if (error instanceof Error) { console.error(` Message: ${error.message}`); }
    else { console.error(" An unexpected error occurred:", error); }
    // Stop execution if approval fails
    throw new Error("Token approval failed. Cannot proceed with the bridge transaction.");
  }


  // --- Send Main Bridge Transaction ---
  // This part only runs if the approval check/transaction above was successful
  try {
    console.log("\n--- Sending Main Bridge Transaction ---");
    console.log("Submitting the deBridge transaction request...");

    const txResponse: TransactionResponse = await signer.sendTransaction(transactionRequest);

    console.log(`Main transaction sent successfully!`);
    console.log(` --> Transaction Hash: ${txResponse.hash}`);
    console.log(` --> View on Basescan: https://basescan.com/tx/${txResponse.hash}`);

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