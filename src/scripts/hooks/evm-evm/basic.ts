import 'dotenv/config';
import {
  ethers,
  Wallet,
  JsonRpcProvider,
  Contract,
  formatUnits,

  TransactionResponse,
  TransactionReceipt,
  TransactionRequest,
  Interface
} from "ethers";
import { deBridgeHookInput } from '../../../types';
import { createDebridgeBridgeHook } from '../../../utils/deBridge/createDeBridgeHook';
import { erc20Abi } from '../../../constants';
import { getEnvConfig, getJsonRpcProviders } from '../../../utils';

async function main() {
  const { privateKey, polygonRpcUrl, arbRpcUrl, bnbRpcUrl } = getEnvConfig();

  const { polygonProvider, arbitrumProvider } = await getJsonRpcProviders({ polygonRpcUrl: polygonRpcUrl, arbRpcUrl: arbRpcUrl, bnbRpcUrl: bnbRpcUrl });

  // --- Wallet and Signer Setup ---
  const wallet = new Wallet(privateKey);
  const signerPolygon = wallet.connect(polygonProvider);
  const singerArbitrum = wallet.connect(arbitrumProvider)
  const senderAddress = await signerPolygon.getAddress();
  console.log(`\nWallet Address (Signer): ${senderAddress}`);

  // --- Prepare deBridge Order ---
  const polygonUsdcAddress = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
  const arbUsdcAddress = '0xaf88d065e77c8cc2239327c5edb3a432268e5831';
  const usdcDecimals = 6; // Polygon and Arbitrum USDC have 6 decimals, as typical
  const amountToSend = "2"; // The amount of USDC to send

  const aavePoolPolygonAddress = "0x794a61358D6845594F94dc1DB02A252b5b4814aD";

  const amountInAtomicUnit = ethers.parseUnits(amountToSend, usdcDecimals);
  const hookCalldata = await generateAaveSupplyCalldata();
  const hookInput: deBridgeHookInput = {
    srcChainId: '42161',
    srcChainTokenIn: arbUsdcAddress,
    srcChainTokenInAmount: amountInAtomicUnit.toString(),
    dstChainId: '137',
    dstChainTokenOut: polygonUsdcAddress,
    dstChainTokenOutRecipient: senderAddress,
    account: senderAddress,
    srcChainOrderAuthorityAddress: wallet.address,
    dstChainOrderAuthorityAddress: wallet.address,
    dlnHook: {
      type: 'evm_transaction_call',
      data: {
        to: aavePoolPolygonAddress,
        calldata: hookCalldata,
        gas: 0
      }
    }
  };

  console.log("\nCreating deBridge order with input:", JSON.stringify(hookInput, null, 2));
  const order = await createDebridgeBridgeHook(hookInput);

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
  console.log(` Token to approve: ${hookInput.srcChainTokenIn} (Arbitrum USDC)`);
  console.log(` Spender address: ${spenderAddress}`);
  console.log(` Amount required: ${formatUnits(amountInAtomicUnit, usdcDecimals)} USDC`);

  // Create a contract instance for the token, connected to the signer
  const tokenContract = new Contract(hookInput.srcChainTokenIn, erc20Abi, singerArbitrum);
  const requiredAmountBigInt = BigInt(order.estimation.srcChainTokenIn.amount);

  try {
    console.log(`Checking current allowance...`);
    const currentAllowance: bigint = await tokenContract.allowance(senderAddress, spenderAddress);
    console.log(` Current allowance: ${formatUnits(currentAllowance, usdcDecimals)} USDC`);
    const currentBalance: bigint = await tokenContract.balanceOf(senderAddress);
    console.log(` Current balance: ${formatUnits(currentBalance, usdcDecimals)} USDC`);

    // Check if current allowance is less than the required amount
    if (currentAllowance < requiredAmountBigInt) {
      console.log("Allowance is insufficient. Sending approve transaction...");

      // Send the approve transaction
      const approveTxResponse: TransactionResponse = await tokenContract.approve(spenderAddress, requiredAmountBigInt);

      console.log(`Approve transaction sent!`);
      console.log(` --> Transaction Hash: ${approveTxResponse.hash}`);
      console.log(` --> View on Polygonscan: https://polygonscan.com/tx/${approveTxResponse.hash}`);
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

    const txResponse: TransactionResponse = await singerArbitrum.sendTransaction(transactionRequest);

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

async function generateAaveSupplyCalldata() {
  const config = getEnvConfig()
  const { privateKey, polygonRpcUrl, arbRpcUrl, bnbRpcUrl } = config;
  const { polygonProvider } = await getJsonRpcProviders({ polygonRpcUrl, arbRpcUrl, bnbRpcUrl });

  // --- Wallet and Signer Setup ---
  const wallet = new Wallet(privateKey);
  const signer = wallet.connect(polygonProvider);
  const senderAddress = await signer.getAddress();
  console.log(`\nWallet Address (Signer): ${senderAddress}`);

  const polygonUsdcAddress = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
  const usdcDecimals = 6;

  // --- Define arguments for the supply function ---
  const assetAddress = polygonUsdcAddress; // The address of the asset to supply (e.g., USDC on Polygon)
  const supplyAmount = ethers.parseUnits("1", usdcDecimals); // The amount to supply in atomic units
  const onBehalfOfAddress = senderAddress; // The address on whose behalf to supply (can be the same as the sender)
  const referralCode = 0; // Aave referral code (optional, can be 0)

  const aavePoolAbi: Interface = new ethers.Interface(["function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) public"]);

  // --- Create the calldata ---
  const calldata = aavePoolAbi.encodeFunctionData("supply", [
    assetAddress,
    supplyAmount,
    onBehalfOfAddress,
    referralCode
  ]);

  console.log("\n--- Aave Pool Supply Calldata ---");
  console.log("Target Contract Address:", "0x794a61358D6845594F94dc1DB02A252b5b4814aD");
  console.log("Calldata:", calldata);

  return calldata;
}

// Execute main function and catch any top-level errors
main().catch((error) => {
  // Avoid double-logging errors already caught and re-thrown inside main
  if (!(error instanceof Error && error.message.includes("Token approval failed"))) {
    console.error("\n🚨 FATAL ERROR in script execution:", error);
  }
  process.exitCode = 1;
});
