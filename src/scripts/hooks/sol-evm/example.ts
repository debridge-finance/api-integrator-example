import 'dotenv/config';
import { Wallet} from "ethers";
import { deBridgeHookInput } from '../../../types';
import { createDebridgeBridgeHook } from '../../../utils/deBridge/createDeBridgeHook';
import bs58 from 'bs58';
import { getEnvConfig, getJsonRpcProviders } from '../../../utils';
import { Connection, Keypair } from "@solana/web3.js";
import { USDC } from '../../../utils/tokens';
import { generateAaveSupplyCalldata } from '../../../utils/hooks';
import { prepareSolanaTransaction } from '../../../utils/solana';
import { CHAIN_IDS } from '../../../utils/chains';

async function main() {
  const { privateKey, solRpcUrl, solPrivateKey } = getEnvConfig();

  const { polygonProvider } = await getJsonRpcProviders();

  // --- Wallet and Signer Setup ---
  const wallet = new Wallet(privateKey);
  const signerPolygon = wallet.connect(polygonProvider);
  const senderAddress = await signerPolygon.getAddress();
  const solWallet = Keypair.fromSecretKey(bs58.decode(solPrivateKey));
  console.log(`\nWallet Address (Signer): ${senderAddress}`);

  // --- Prepare deBridge Order ---
  const solanaAddress = "862oLANNqhdXyUCwLJPBqUHrScrqNR4yoGWGTxjZftKs";

  const aavePoolPolygonAddress = "0x794a61358D6845594F94dc1DB02A252b5b4814aD";

  const hookCalldata = await generateAaveSupplyCalldata(senderAddress);
  const hookInput: deBridgeHookInput = {
    prependOperatingExpenses: true,
    additionalTakerRewardBps: 0,
    srcChainId: CHAIN_IDS.Solana.toString(),
    srcChainTokenIn: USDC.SOLANA,
    srcChainTokenInAmount: "auto",
    dstChainId: CHAIN_IDS.Polygon.toString(),
    dstChainTokenOut: USDC.POLYGON,
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

  const signedTx = await prepareSolanaTransaction(solRpcUrl, order.tx.data, solWallet);
  const connection = new Connection(solRpcUrl, { commitment: "confirmed" });

  // --- Send Main Bridge Transaction on Solana ---
  try {
    console.log("\n--- Sending deBridge tx on Solana ---");
    // serialize and send raw VersionedTransaction
    const raw = signedTx.serialize();
    const signature = await connection.sendRawTransaction(raw, { skipPreflight: false });
    console.log(`✅ Transaction sent! Signature: ${signature}`);

    console.log(`🎉 Check tx on solscan: \n https://solscan.io/tx/${signature}`);
  } catch (err) {
    console.error("\n🚨 Error sending or confirming Solana transaction:");
    console.error(err);
    process.exitCode = 1;
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
