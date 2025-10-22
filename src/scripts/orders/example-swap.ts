/**
 * A flattened script showcasing everything needed to complete a swap between Polygon and Arbitrum.
 * 
 * The script covers several steps needed to complete a swap between Polygon and Arbitrum, 
 * along with the demonstration of how to call the approve on ERC-20 tokens.
 */

import 'dotenv/config';
import {
  ethers,
  Wallet,
  Contract,
  formatUnits,
  TransactionResponse,
  TransactionReceipt,
  TransactionRequest,
  InterfaceAbi,
  JsonRpcProvider
} from "ethers";
import { USDC } from '../../utils/tokens';

// API endpoint for deBridge operations
export const DEBRIDGE_API = "https://dln.debridge.finance/v1.0";

// Minimal ERC-20 ABI: balance, decimals, symbol, allowance, approve
export const erc20Abi: InterfaceAbi = [
  // Read-only functions
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function allowance(address owner, address spender) view returns (uint256)",
  // State-changing functions
  "function approve(address spender, uint256 amount) returns (bool)",
];

// Input parameters for creating a deBridge order
export interface deBridgeOrderInput {
  srcChainId: string;
  srcChainTokenIn: string;
  srcChainTokenInAmount: string;
  dstChainId: string;
  dstChainTokenOut: string;
  dstChainTokenOutRecipient?: string;
  account?: string;
  dstChainTokenOutAmount?: string;
  slippage?: number;
  additionalTakerRewardBps?: number;
  srcIntermediaryTokenAddress?: string;
  dstIntermediaryTokenAddress?: string;
  dstIntermediaryTokenSpenderAddress?: string;
  intermediaryTokenUSDPrice?: number;
  srcAllowedCancelBeneficiary?: string;
  referralCode?: number;
  affiliateFeePercent?: number;
  srcChainOrderAuthorityAddress?: string;
  srcChainRefundAddress?: string;
  dstChainOrderAuthorityAddress?: string;
  prependOperatingExpenses?: boolean;
  deBridgeApp?: string;
}

// Response structure for a deBridge order
export interface deBridgeOrderResponse {
  tx: {
    data: string;
    to: string;
    value: string;
  };
  estimation: {
    srcChainTokenIn: {
      amount: string;
      tokenAddress: string;
      decimals: number;
      symbol: string;
    };
    dstChainTokenOut: {
      amount: string;
      tokenAddress: string;
      decimals: number;
      symbol: string;
    };
    fees: {
      srcChainTokenIn: string;
      dstChainTokenOut: string;
    };
  };
}

/**
 * Load and validate required environment variables.
 *
 * @throws If any variable is missing.
 * @returns The validated configuration.
 */
export function getEnvConfig() {
  console.log("Loading environment variables...");

  const privateKey = process.env.SIGNER_PK;
  const polygonRpcUrl = process.env.POLYGON_RPC_URL;
  const arbRpcUrl = process.env.ARB_RPC_URL;

  let error = "";

  if (!privateKey) {
    error += "\nSIGNER_PK not found in .env file.";
  }
  if (!polygonRpcUrl) {
    error += "\nPOLYGON_RPC_URL not found in .env file.";
  }
  if (!arbRpcUrl) {
    error += "\nARB_RPC_URL not found in .env file.";
  }

  if (error) {
    throw new Error(`Invalid configuration. ${error}`);
  }

  return { privateKey, polygonRpcUrl, arbRpcUrl };
}

/**
 * Initialize JSON-RPC providers for supported networks.
 *
 * @param rpcUrls - RPC URLs for Polygon and Arbitrum.
 * @returns The JSON-RPC providers.
 * @throws If connection to any provider fails.
 */
export async function getJsonRpcProviders(
  rpcUrls: { polygonRpcUrl: string; arbRpcUrl: string }
) {
  let polygonProvider: JsonRpcProvider;
  let arbitrumProvider: JsonRpcProvider;

  try {
    console.log(`\nConnecting to Polygon at ${rpcUrls.polygonRpcUrl}`);
    polygonProvider = new JsonRpcProvider(rpcUrls.polygonRpcUrl);

    console.log(`Connecting to Arbitrum at ${rpcUrls.arbRpcUrl}`);
    arbitrumProvider = new JsonRpcProvider(rpcUrls.arbRpcUrl);

    const polygonNetwork = await polygonProvider.getNetwork();
    console.log(
      `Polygon connected: ${polygonNetwork.name} (chainId=${polygonNetwork.chainId})`
    );

    const arbitrumNetwork = await arbitrumProvider.getNetwork();
    console.log(
      `Arbitrum connected: ${arbitrumNetwork.name} (chainId=${arbitrumNetwork.chainId})`
    );
  } catch (err) {
    console.error(
      `Failed to initialize providers: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    throw new Error("Could not connect to one or more JSON-RPC providers.");
  }

  return { polygonProvider, arbitrumProvider };
}

/**
 * Create a deBridge cross-chain transfer order.
 *
 * @param params - Bridge order parameters.
 * @returns The order response including transaction data.
 * @throws If source and destination chains are the same or API call fails.
 */
export async function createDebridgeBridgeOrder(
  params: deBridgeOrderInput
): Promise<deBridgeOrderResponse> {
  if (params.srcChainId === params.dstChainId) {
    throw new Error("Source and destination chains must differ.");
  }

  // Build query string parameters
  const queryParams = new URLSearchParams({
    srcChainId: params.srcChainId,
    srcChainTokenIn: params.srcChainTokenIn,
    srcChainTokenInAmount: params.srcChainTokenInAmount,
    dstChainId: params.dstChainId,
    dstChainTokenOut: params.dstChainTokenOut,
    dstChainTokenOutRecipient: params.dstChainTokenOutRecipient || "",
    dstChainTokenOutAmount: params.dstChainTokenOutAmount || "auto",
    senderAddress: params.account || "",
    srcChainOrderAuthorityAddress:
      params.srcChainOrderAuthorityAddress || params.account || "",
    srcChainRefundAddress: params.account || "",
    dstChainOrderAuthorityAddress:
      params.dstChainOrderAuthorityAddress || params.dstChainTokenOutRecipient || "",
    referralCode: "31805",
    prependOperatingExpenses: "true"
  });

  const response = await fetch(
    `${DEBRIDGE_API}/dln/order/create-tx?${queryParams}`
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to create order: ${response.statusText}. ${errorText}`
    );
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`deBridge API error: ${data.error}`);
  }

  // Ensure tx.data is a string
  if (data.tx?.data) {
    data.tx.data = data.tx.data.toString();
  }

  return data;
}

// ===== Main Execution =====
async function main() {
  // Load configuration and connect providers
  const { privateKey, polygonRpcUrl, arbRpcUrl } = getEnvConfig();
  const { polygonProvider } = await getJsonRpcProviders({ polygonRpcUrl, arbRpcUrl });

  // Initialize wallet and signer on Polygon
  const wallet = new Wallet(privateKey);
  const signer = wallet.connect(polygonProvider);
  const senderAddress = await signer.getAddress();
  console.log(`\nSigner address: ${senderAddress}`);

  // Prepare token addresses, decimals, and amount
  const usdcDecimals = 6;
  const amountToSend = "0.1";

  // Convert amount to atomic units
  const amountInAtomicUnit = ethers.parseUnits(amountToSend, usdcDecimals);

  // Construct order parameters
  const orderInput: deBridgeOrderInput = {
    srcChainId: '137',
    srcChainTokenIn: USDC.POLYGON,
    srcChainTokenInAmount: amountInAtomicUnit.toString(),
    dstChainId: '42161',
    dstChainTokenOut: USDC.ARBITRUM,
    dstChainTokenOutRecipient: senderAddress,
    account: senderAddress,
    srcChainOrderAuthorityAddress: wallet.address,
    dstChainOrderAuthorityAddress: wallet.address
  };

  console.log(
    "\nCreating deBridge order with input:",
    JSON.stringify(orderInput, null, 2)
  );
  const order = await createDebridgeBridgeOrder(orderInput);

  if (!order?.tx?.to || !order.tx.data) {
    throw new Error("Invalid transaction data returned from order creation.");
  }

  console.log("\nOrder estimation:", order.estimation);
  const transactionRequest: TransactionRequest = order.tx;

  // ===== Token Approval =====
  const spenderAddress = transactionRequest.to;
  if (!spenderAddress) {
    throw new Error("Missing 'to' address in transaction request.");
  }

  console.log("\nChecking or setting token approval...");
  console.log(
    ` Token: ${orderInput.srcChainTokenIn} | Spender: ${spenderAddress}`
  );
  console.log(
    ` Required amount: ${formatUnits(amountInAtomicUnit, usdcDecimals)} USDC`
  );

  const tokenContract = new Contract(
    orderInput.srcChainTokenIn,
    erc20Abi,
    signer
  );
  const requiredAmount = BigInt(order.estimation.srcChainTokenIn.amount);

  try {
    console.log("Checking current allowance...");
    const currentAllowance: bigint = await tokenContract.allowance(
      senderAddress,
      spenderAddress
    );
    console.log(
      ` Current allowance: ${formatUnits(currentAllowance, usdcDecimals)} USDC`
    );

    if (currentAllowance < requiredAmount) {
      console.log("Allowance insufficient—sending approval...");
      const approveTx: TransactionResponse = await tokenContract.approve(
        spenderAddress,
        requiredAmount
      );
      console.log(` Approval tx hash: ${approveTx.hash}`);
      console.log(
        ` Waiting for confirmation on Polygonscan: https://polygonscan.com/tx/${approveTx.hash}`
      );
      const receipt: TransactionReceipt | null = await approveTx.wait();
      if (receipt?.status !== 1) {
        throw new Error(
          `Approval failed (status=${receipt?.status}).`
        );
      }
      console.log("Approval successful! ✅");
    } else {
      console.log("Sufficient allowance already granted. 👍");
    }
  } catch (err) {
    console.error("\nError during approval:",
      err instanceof Error ? err.message : err
    );
    throw new Error("Token approval failed—cannot proceed.");
  }

  // ===== Main Bridge Transaction =====
  try {
    console.log("\nSubmitting bridge transaction...");
    const txResponse: TransactionResponse =
      await signer.sendTransaction(transactionRequest);
    console.log(`Bridge tx hash: ${txResponse.hash}`);
    console.log(`Explorer: https://polygonscan.com/tx/${txResponse.hash}`);

    console.log(" Waiting for confirmation...");
    const txReceipt: TransactionReceipt | null = await txResponse.wait();
    if (txReceipt) {
      console.log("Bridge transaction mined.");
      console.log(
        ` Status: ${txReceipt.status === 1 ? '✅ Success' : '❌ Failed'}`
      );
      console.log(
        ` Block: ${txReceipt.blockNumber} | Gas used: ${txReceipt.gasUsed.toString()}`
      );
    } else {
      console.error(
        "No receipt—transaction may have been dropped or replaced."
      );
    }
  } catch (err) {
    console.error("\nError sending bridge transaction:",
      err instanceof Error ? err.message : err
    );
    process.exitCode = 1;
  }

  console.log("\nScript execution complete.");
}

// Run the main function and handle uncaught errors
main().catch((err) => {
  console.error("\nFATAL ERROR:",
    err instanceof Error ? err.message : err
  );
  process.exitCode = 1;
});
