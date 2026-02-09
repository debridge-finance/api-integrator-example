import 'dotenv/config';
import {
  ethers,
  Wallet,
  TransactionResponse,
  TransactionReceipt, 
  TransactionRequest
} from "ethers";
import { SameChainSwapInput } from '../../types';
import { getEnvConfig, getJsonRpcProviders } from '../../utils';
import { createDeBridgeSameChainSwap } from '../../utils/deBridge/sameChainSwap';
import { EVM_NATIVE_TOKEN, USDM } from '../../utils/tokens';
import { CHAIN_IDS } from '../../utils/chains';

async function main() {
  const { privateKey } = getEnvConfig();

  const { megaEthProvider } = await getJsonRpcProviders();

  if (!megaEthProvider) {
    throw new Error("MegaETH provider is not available. Please check your .env configuration and ensure MEGA_ETH_RPC_URL is set correctly.");
  }

  // --- Wallet and Signer Setup ---
  const wallet = new Wallet(privateKey);
  const signer = wallet.connect(megaEthProvider);
  const senderAddress = await signer.getAddress();
  console.log(`\nWallet Address (Signer): ${senderAddress}`);

  // --- Prepare deBridge Order ---
  const amountToSend = "0.00002"; 

  const amountInAtomicUnit = ethers.parseUnits(amountToSend, EVM_NATIVE_TOKEN.decimals);

  const sameChainSwapInput: SameChainSwapInput = {
    chainId: CHAIN_IDS.MegaETH.toString(),
    tokenIn: EVM_NATIVE_TOKEN.address,
    tokenInAmount: amountInAtomicUnit.toString(),
    tokenOut: USDM.MegaETH,
    tokenOutRecipient: senderAddress,
    senderAddress: senderAddress,
  }

  console.log("\nCreating deBridge order with input:", JSON.stringify(sameChainSwapInput, null, 2));
  const swap = await createDeBridgeSameChainSwap(sameChainSwapInput);

  if (!swap || !swap.tx || !swap.tx.to || !swap.tx.data) {
    throw new Error("Invalid transaction request object from createDeBridgeSameChainSwap.");
  }

  console.log("\nOrder Estimation:", swap);
  const transactionRequest: TransactionRequest = swap.tx;
  console.log("\nTransaction Request Object:", transactionRequest);

  // --- Approve Token Spending ---
  const spenderAddress = transactionRequest.to; // The deBridge contract address needing approval
  if (!spenderAddress) {
    throw new Error("Transaction request is missing the 'to' address (spender).");
  }

  // --- Send Main Transaction ---
  // This part only runs if the approval check/transaction above was successful
  try {
    console.log("\n--- Sending Main Bridge Transaction ---");
    console.log("Submitting the deBridge transaction request...");

    const txResponse: TransactionResponse = await signer.sendTransaction(transactionRequest);

    console.log(`Main transaction sent successfully!`);
    console.log(` --> Transaction Hash: ${txResponse.hash}`);
    console.log(` --> View on MegaETH Blockscout: https://megaeth.blockscout.com/tx/${txResponse.hash}`);

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