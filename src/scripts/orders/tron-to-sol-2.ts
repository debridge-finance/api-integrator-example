import "dotenv/config";
import * as TronWebNS from "tronweb";
import { createDebridgeBridgeOrder } from "../../utils/deBridge/createDeBridgeOrder";
import { deBridgeOrderInput } from "../../types";

interface TronTriggerConstantContractResponse {
  result?: { result?: boolean; message?: string };
  constant_result?: string[];
  logs?: unknown[];
  energy_used?: number;
  energy_penalty?: number;
  transaction?: { txID?: string };
}

const hexToUtf8 = (hex?: string) => {
  if (!hex) return "";
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  try { return Buffer.from(clean, "hex").toString("utf8"); } catch { return ""; }
};

async function main() {
  // --- ENV ---
  const privateKey = process.env.TRON_PK;
  const tronFullnode = process.env.TRON_RPC_URL || "https://api.trongrid.io";
  const tronGridKey = process.env.TRONGRID_API_KEY;
  if (!privateKey || !tronFullnode) {
    throw new Error("Missing env: TRON_PK and TRON_RPC_URL are required.");
  }

  const tronWeb = new TronWebNS.TronWeb({
    fullHost: tronFullnode,
    headers: tronGridKey ? { "TRON-PRO-API-KEY": tronGridKey } : undefined,
    privateKey,
  });

  // --- Signer ---
  const senderBase58 = tronWeb.defaultAddress.base58;
  if (!senderBase58) throw new Error("Failed to derive sender address from private key");
  const senderHex41 = tronWeb.address.toHex(senderBase58);

  // --- Current balance ---
  const preBalSun = await tronWeb.trx.getBalance(senderBase58);
  const preBalTRX = preBalSun / 1e6;

  // --- Bridge parameters ---
  const TRX_SENTINEL = "T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb";
  const SOL_NATIVE = "11111111111111111111111111111111";
  const SOLANA_RECIPIENT = "862oLANNqhdXyUCwLJPBqUHrScrqNR4yoGWGTxjZftKs";
  
  const amountTRX = 5;
  const amountSun = String(amountTRX * 1e6);

  // --- Create order ---
  const orderInput: deBridgeOrderInput = {
    srcChainId: "100000026",
    srcChainTokenIn: TRX_SENTINEL,
    srcChainTokenInAmount: amountSun,
    dstChainId: "7565164",
    dstChainTokenOut: SOL_NATIVE,
    dstChainTokenOutRecipient: SOLANA_RECIPIENT,
    account: senderBase58,
    srcChainOrderAuthorityAddress: senderBase58,
    dstChainOrderAuthorityAddress: SOLANA_RECIPIENT,
  };

  const order: any = await createDebridgeBridgeOrder(orderInput);
  if (!order?.tx?.to || !order?.tx?.data || !order?.tx?.value) {
    throw new Error("Invalid order: missing tx.to / tx.data / tx.value");
  }

  // --- SIMULATION ---
  const contractHex41 = tronWeb.address.toHex(order.tx.to);
  const dataNo0x = order.tx.data.startsWith("0x") ? order.tx.data.slice(2) : order.tx.data;

  const sim = (await tronWeb.fullNode.request(
    "wallet/triggerconstantcontract",
    {
      owner_address: senderHex41,
      contract_address: contractHex41,
      call_value: Number(order.tx.value),
      data: dataNo0x,
    },
    "post"
  )) as TronTriggerConstantContractResponse;

  const simOk = sim?.result?.result === true;
  console.log("Simulation:", simOk ? "ok" : "failed");
  console.log("Simulation energy_used:", sim?.energy_used ?? "n/a");

  if (!simOk) {
    const revertUtf8 = hexToUtf8(sim?.result?.message);
    if (sim?.result?.message) console.log("Revert(hex):", sim.result.message);
    if (revertUtf8) console.log("Revert(utf8):", revertUtf8);
    throw new Error("Simulation indicates failure");
  }

  // --- Balance precheck ---
  const gasLimitBasis = sim.energy_used ?? Number(order?.estimatedTransactionFee?.details?.gasLimit ?? 500_000);
  const gasPriceSun = Number(order?.estimatedTransactionFee?.details?.gasPrice ?? 420);
  const bufferPct = 1.3;
  const feeLimit = Math.max(Math.ceil(gasLimitBasis * gasPriceSun * bufferPct), 50_000_000);

  const callValueSun = Number(order.tx.value);
  const totalRequiredSun = callValueSun + feeLimit;

  console.log("=== Balance precheck ===");
  console.log("Current balance (TRX):", preBalTRX.toFixed(6));
  console.log("callValue (TRX):      ", (callValueSun / 1e6).toFixed(6));
  console.log(
    "feeLimit (TRX):       ",
    (feeLimit / 1e6).toFixed(6),
    `(energy=${gasLimitBasis}, gasPrice=${gasPriceSun} SUN, buffer=${Math.round((bufferPct - 1) * 100)}%)`
  );
  console.log("total required (TRX): ", (totalRequiredSun / 1e6).toFixed(6));

  if (preBalSun < totalRequiredSun) {
    const missing = (totalRequiredSun - preBalSun) / 1e6;
    throw new Error(`Insufficient balance. Missing ~${missing.toFixed(6)} TRX`);
  } else {
    console.log("Sufficient balance detected");
  }

  // --- REAL TX (still commented) ---
  
  const inputData = order.tx.data.startsWith("0x") ? order.tx.data.slice(2) : order.tx.data;
  const to41Format = order.tx.to.replace(/^0x/, "41");
  const signerHex41Maybe = tronWeb.defaultAddress.hex;
  if (!signerHex41Maybe) throw new Error("Failed to read defaultAddress.hex");
  const signerHex41: string = signerHex41Maybe;

  const unsigned = await tronWeb.transactionBuilder.triggerSmartContract(
    to41Format,
    "",
    { callValue: callValueSun, input: inputData, feeLimit },
    [],
    signerHex41
  );

  if (!unsigned.result?.result) throw new Error("Failed to build transaction");
  console.log("PreparedTx:", unsigned?.transaction?.txID ?? "n/a");

  const signed = await tronWeb.trx.sign(unsigned.transaction, privateKey);
  const receipt = await tronWeb.trx.sendRawTransaction(signed);

  if (receipt.code) {
    const errMsg = tronWeb.toUtf8(receipt.message);
    throw new Error(`Transaction failed: ${receipt.code}: ${errMsg}`);
  }
  if (!receipt.result) throw new Error("Transaction broadcast failed");

  console.log("TX Hash:", receipt.txid);
  console.log(`TronScan: https://tronscan.org/#/transaction/${receipt.txid}`);
  
}

main().catch((err) => {
  console.error("FATAL ERROR:", err?.message ?? err);
  process.exitCode = 1;
});
