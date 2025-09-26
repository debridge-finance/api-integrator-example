import { InterfaceAbi } from "ethers";

// This is the official API - please do not use the alternative URLs.
export const DEBRIDGE_API = "https://dln.debridge.finance/v1.0" 

export const erc20Abi: InterfaceAbi = [
  // Read-Only Functions
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function allowance(address owner, address spender) view returns (uint256)", // Added
  // State-Changing Functions
  "function approve(address spender, uint256 amount) returns (bool)", // Added
];
export const aavePoolAbi: InterfaceAbi = [
  "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) public virtual override"
]
export const POLYGON_MAINNET_CHAIN_ID = 137n;
export const BNB_MAINNET_CHAIN_ID = 56n;