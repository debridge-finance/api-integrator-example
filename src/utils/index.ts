import 'dotenv/config';
import { JsonRpcProvider } from "ethers";
import { VersionedTransaction } from "@solana/web3.js";

export async function getJsonRpcProviders() {
  let polygonProvider: JsonRpcProvider;
  let arbitrumProvider: JsonRpcProvider;
  let bnbProvider: JsonRpcProvider;
  let baseProvider: JsonRpcProvider;
  let megaEthProvider: JsonRpcProvider;

  const rpcUrls = getEnvConfig();

  try {
    console.log(`\nAttempting to connect to Polygon via: ${rpcUrls.polygonRpcUrl}`);
    polygonProvider = new JsonRpcProvider(rpcUrls.polygonRpcUrl);
    console.log(`\nAttempting to connect to Arbitrum via: ${rpcUrls.arbRpcUrl}`);
    arbitrumProvider = new JsonRpcProvider(rpcUrls.arbRpcUrl);
    console.log(`\nAttempting to connect to BNB via: ${rpcUrls.bnbRpcUrl}`);
    bnbProvider = new JsonRpcProvider(rpcUrls.bnbRpcUrl);
    console.log(`\nAttempting to connect to Base via: ${rpcUrls.baseRpcUrl}`);
    baseProvider = new JsonRpcProvider(rpcUrls.baseRpcUrl);

    if (rpcUrls.polygonRpcUrl) {
      const polygonNetwork = await polygonProvider.getNetwork();
      console.log(`Polygon connection successful. (Network: ${polygonNetwork.name}, Chain ID: ${polygonNetwork.chainId})`);
    }
    if (rpcUrls.arbRpcUrl) {
      const arbitrumNetwork = await arbitrumProvider.getNetwork();
      console.log(`Arbitrum connection successful. (Network: ${arbitrumNetwork.name}, Chain ID: ${arbitrumNetwork.chainId})`);
    }
    if (rpcUrls.bnbRpcUrl) {
      const bnbNetwork = await bnbProvider.getNetwork();
      console.log(`BNB connection successful. (Network: ${bnbNetwork.name}, Chain ID: ${bnbNetwork.chainId})`);
    }
    if (rpcUrls.baseRpcUrl) {
      const baseNetwork = await baseProvider.getNetwork();
      console.log(`Base connection successful. (Network: ${baseNetwork.name}, Chain ID: ${baseNetwork.chainId})`);
    }

    if (rpcUrls.megaEthRpcUrl) {
      console.log(`\nAttempting to connect to MegaETH via: ${rpcUrls.megaEthRpcUrl}`);
      megaEthProvider = new JsonRpcProvider(rpcUrls.megaEthRpcUrl);
      const megaEthNetwork = await megaEthProvider.getNetwork();
      console.log(`MegaETH connection successful. (Network: ${megaEthNetwork.name}, Chain ID: ${megaEthNetwork.chainId})`);
    }

  } catch (error) {
    console.error(`Failed to connect: ${error instanceof Error ? error.message : String(error)}`);
    throw new Error("Could not connect to a Provider.");
  }

  return {
    polygonProvider,
    arbitrumProvider,
    bnbProvider,
    baseProvider,
    megaEthProvider
  }
}

export function getEnvConfig() {
  // --- Environment Variable Loading and Validation ---
  console.log("Loading environment variables...");
  const privateKey = process.env.SIGNER_PK;
  const polygonRpcUrl = process.env.POLYGON_RPC_URL;
  const arbRpcUrl = process.env.ARB_RPC_URL;
  const bnbRpcUrl = process.env.BNB_RPC_URL;
  const solRpcUrl = process.env.SOL_RPC_URL;
  const baseRpcUrl = process.env.BASE_RPC_URL;
  const solPrivateKey = process.env.SOL_PK;
  const tronPrivateKey = process.env.TRON_PK;
  const tronRpcUrl = process.env.TRON_RPC_URL;
  const tronGridApiKey = process.env.TRONGRID_API_KEY;
  const megaEthRpcUrl = process.env.MEGA_ETH_RPC_URL;

  let error = ""

  if (!privateKey) {
    error += "\nSIGNER_PK not found in .env file.";
  }
  if (!polygonRpcUrl) {
    error += "\nPOLYGON_RPC_URL not found in .env file. Cannot proceed.";
  }
  if (!arbRpcUrl) {
    error += "\nARB_RPC_URL not found in .env file.";
  }
  if (!bnbRpcUrl) {
    error += "\nBNB_RPC_URL not found in .env file.";
  }
  if (!solRpcUrl) {
    error += "\nSOL_RPC_URL not found in .env file.";
  }
  if (!solPrivateKey) {
    error += "\nSOL_PK not found in .env file.";
  }
  if (!baseRpcUrl) {
    error += "\nBASE_RPC_URL not found in .env file.";
  }
  if (!tronPrivateKey) {
    error += "\nTRON_PK not found in .env file.";
  }
  if (!tronRpcUrl) {
    error += "\nTRON_RPC_URL not found in .env file.";
  }
  
  if (error !== "") {
    throw new Error(`Invalid configuration. ${error}`);
  }

  return {
    privateKey,
    solPrivateKey,
    polygonRpcUrl,
    arbRpcUrl,
    bnbRpcUrl,
    baseRpcUrl,
    solRpcUrl,
    tronPrivateKey,
    tronRpcUrl,
    tronGridApiKey,
    megaEthRpcUrl
  }
}

function encodeNumberToArrayLE(num: number, arraySize: number): Uint8Array {
  const result = new Uint8Array(arraySize);
  for (let i = 0; i < arraySize; i++) {
    result[i] = Number(num & 0xff);
    num >>= 8;
  }

  return result;
}

export function updatePriorityFee(tx: VersionedTransaction, computeUnitPrice: number, computeUnitLimit?: number) {
  const computeBudgetOfset = 1;
  const computeUnitPriceData = tx.message.compiledInstructions[1].data;
  const encodedPrice = encodeNumberToArrayLE(computeUnitPrice, 8);
  for (let i = 0; i < encodedPrice.length; i++) {
    computeUnitPriceData[i + computeBudgetOfset] = encodedPrice[i];
  }

  if (computeUnitLimit) {
    const computeUnitLimitData = tx.message.compiledInstructions[0].data;
    const encodedLimit = encodeNumberToArrayLE(computeUnitLimit, 4);
    for (let i = 0; i < encodedLimit.length; i++) {
      computeUnitLimitData[i + computeBudgetOfset] = encodedLimit[i];
    }
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}