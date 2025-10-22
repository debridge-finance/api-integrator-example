import 'dotenv/config';
import {
  ethers,
  Wallet} from "ethers";
import { SameChainSwapEstimateInput } from '../../../types';
import { getEnvConfig, getJsonRpcProviders } from '../../../utils';
import { createDeBridgeSameChainSwapEstimate } from '../../../utils/deBridge/sameChainSwapEstimate';
import { EVM_NATIVE_TOKEN, USDC } from '../../../utils/tokens';
import { CHAIN_IDS } from '../../../utils/chains';

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

  const amountInAtomicUnit = ethers.parseUnits(amountToSend, usdcDecimals);

  const sameChainSwapEstimateInput: SameChainSwapEstimateInput = {
    chainId: CHAIN_IDS.Polygon.toString(),
    tokenIn: USDC.POLYGON,
    tokenInAmount: amountInAtomicUnit.toString(),
    tokenOut: EVM_NATIVE_TOKEN.address,
  }

  console.log("\nCreating deBridge order with input:", JSON.stringify(sameChainSwapEstimateInput, null, 2));
  const swap = await createDeBridgeSameChainSwapEstimate(sameChainSwapEstimateInput);

  if (!swap || !swap.estimation) {
    throw new Error("Invalid estimation from createDeBridgeSameChainSwapEstimate.");
  }

  console.log("\nOrder Estimation:", swap.estimation);

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