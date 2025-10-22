import 'dotenv/config';
import {
  ethers,
  Wallet,
  TransactionRequest
} from "ethers";
import { Connection, Keypair } from "@solana/web3.js";
import bs58 from 'bs58';
import { SameChainSwapInput } from '../../types';
import { getEnvConfig } from '../../utils';
import { createDeBridgeSameChainSwap } from '../../utils/deBridge/sameChainSwap';
import { SOL, USDC } from '../../utils/tokens';
import { prepareSolanaTransaction } from '../../utils/solana';

async function main() {
  const { privateKey, solPrivateKey, solRpcUrl } = getEnvConfig();

  // --- Wallet and Signer Setup ---
  const wallet = new Wallet(privateKey);
  const evmUserAddress = wallet.address;
  const solWallet = Keypair.fromSecretKey(bs58.decode(solPrivateKey));

  console.log(`\nSOL address (sender): ${solWallet.publicKey.toBase58()}`)
  console.log(`\nEVM address (recipient): ${evmUserAddress}`);

  // --- Prepare deBridge Order ---
  const usdcDecimals = 6; // Polygon and Arbitrum USDC have 6 decimals, as typical. Solana too. 
  const amountToSend = "0.2"; // The amount of USDC to send

  const amountInAtomicUnit = ethers.parseUnits(amountToSend, usdcDecimals);

  const sameChainSwapInput: SameChainSwapInput = {
    chainId: '7565164',
    tokenIn: USDC.SOLANA,
    tokenInAmount: amountInAtomicUnit.toString(),
    tokenOut: SOL.nativeSol,
    tokenOutRecipient: solWallet.publicKey.toBase58(),
    senderAddress: solWallet.publicKey.toBase58(),
  };

  console.log("\nCreating deBridge order with input:", JSON.stringify(sameChainSwapInput, null, 2));
  const swap = await createDeBridgeSameChainSwap(sameChainSwapInput);

  if (!swap || !swap.tx || !swap.tx.data) {
    throw new Error("Invalid transaction request object from createDeBridgeSameChainSwap.");
  }

  console.log("\nOrder Estimation:", swap);
  const transactionRequest: TransactionRequest = swap.tx;
  console.log("\nTransaction Request Object:", transactionRequest);

  const signedTx = await prepareSolanaTransaction(solRpcUrl, swap.tx.data, solWallet);
  const connection = new Connection(solRpcUrl, { commitment: "confirmed" });

  // --- Send Main Transaction on Solana ---
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