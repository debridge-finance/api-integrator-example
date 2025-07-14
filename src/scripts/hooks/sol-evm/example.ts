import 'dotenv/config';
import {
  ethers,
  Wallet,
  Interface
} from "ethers";
import { deBridgeHookInput } from '../../../types';
import { createDebridgeBridgeHook } from '../../../utils/deBridge/createDeBridgeHook';
import bs58 from 'bs58';
import { getEnvConfig, getJsonRpcProviders, updatePriorityFee } from '../../../utils';
import { VersionedTransaction, Connection, Keypair } from "@solana/web3.js";

async function main() {
  const { privateKey, polygonRpcUrl, arbRpcUrl, bnbRpcUrl, solRpcUrl, solPrivateKey } = getEnvConfig();

  const { polygonProvider } = await getJsonRpcProviders({ polygonRpcUrl: polygonRpcUrl, arbRpcUrl: arbRpcUrl, bnbRpcUrl: bnbRpcUrl });

  // --- Wallet and Signer Setup ---
  const wallet = new Wallet(privateKey);
  const signerPolygon = wallet.connect(polygonProvider);
  const senderAddress = await signerPolygon.getAddress();
  const solWallet = Keypair.fromSecretKey(bs58.decode(solPrivateKey));
  console.log(`\nWallet Address (Signer): ${senderAddress}`);

  // --- Prepare deBridge Order ---
  const polygonUsdcAddress = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
  const usdcDecimals = 6; // Polygon and Arbitrum USDC have 6 decimals, as typical
  const amountToSend = "2"; // The amount of USDC to send

  const solanaUsdcAddress = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

  const solanaAddress = "862oLANNqhdXyUCwLJPBqUHrScrqNR4yoGWGTxjZftKs";

  const aavePoolPolygonAddress = "0x794a61358D6845594F94dc1DB02A252b5b4814aD";

  const hookCalldata = await generateAaveSupplyCalldata();
  const hookInput: deBridgeHookInput = {
    prependOperatingExpenses: true,
    additionalTakerRewardBps: 0,
    srcChainId: '7565164',
    srcChainTokenIn: solanaUsdcAddress,
    srcChainTokenInAmount: "auto",
    dstChainId: '137',
    dstChainTokenOut: polygonUsdcAddress,
    dstChainTokenOutAmount: "1000000", // 1 USDC in atomic units
    dstChainTokenOutRecipient: signerPolygon.address,
    account: solanaAddress,
    srcChainOrderAuthorityAddress: solanaAddress,
    dstChainOrderAuthorityAddress: signerPolygon.address,
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

  const connection = new Connection(solRpcUrl, { commitment: "confirmed" });
  const tx = VersionedTransaction.deserialize(Buffer.from(order.tx.data.slice(2), "hex"));

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

  // --- Send Main Bridge Transaction on Solana ---
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
