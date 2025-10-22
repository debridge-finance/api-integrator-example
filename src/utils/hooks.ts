import { ethers, Interface } from "ethers";
import { USDC } from "./tokens";

export async function generateAaveSupplyCalldata(senderAddress: string) {
  // --- Wallet and Signer Setup ---
  console.log(`\nWallet Address (Signer): ${senderAddress}`);

  const usdcDecimals = 6;

  // --- Define arguments for the supply function ---
  const assetAddress = USDC.POLYGON; // The address of the asset to supply (e.g., USDC on Polygon)
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