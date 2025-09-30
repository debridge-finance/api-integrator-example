import "dotenv/config";
import * as TronWebNS from "tronweb";
import { createDebridgeBridgeOrder } from "../../utils/deBridge/createDeBridgeOrder";
import { deBridgeOrderInput } from "../../types";

/** Config */
const USDT_TRC20_BASE58 = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const BRIDGE_AMOUNT_USDT = 2;
const SOLANA_CHAIN_ID = "7565164";
const SOLANA_RECIPIENT = "<Solana Address>"; // put your recipient
const SOL_NATIVE = "11111111111111111111111111111111";

interface TronSimResponse {
  result?: { result?: boolean; message?: string };
  energy_used?: number;
}

const hexToUtf8 = (hex?: string) => {
  if (!hex) return "";
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  try { return Buffer.from(clean, "hex").toString("utf8"); } catch { return ""; }
};

function initTronWeb() {
  const privateKey = process.env.TRON_PK!;
  const fullnode = process.env.TRON_RPC_URL || "https://api.trongrid.io";
  const apiKey = process.env.TRONGRID_API_KEY;
  if (!privateKey) throw new Error("Missing TRON_PK");
  const tronWeb = new TronWebNS.TronWeb({
    fullHost: fullnode,
    headers: apiKey ? { "TRON-PRO-API-KEY": apiKey } : undefined,
    privateKey,
  });
  return { tronWeb, privateKey };
}

async function getEnergyPriceSun(tronWeb: TronWebNS.TronWeb) {
  const params = await tronWeb.trx.getChainParameters();
  const v = Number(params.find((p: any) => p.key === "getEnergyFee")?.value);
  if (!Number.isFinite(v)) throw new Error("getEnergyFee not found");
  return v;
}
const calcFeeLimit = (energy: number, priceSun: number, buffer = 1.3) =>
  Math.ceil(energy * priceSun * buffer);

/** Simulate **/
async function simulateCall(
  tronWeb: TronWebNS.TronWeb,
  label: string,
  ownerHex41: string,
  contractHex41: string,
  callValueSun: number,
  dataNo0x: string,
) {
  const sim = (await tronWeb.fullNode.request(
    "wallet/triggerconstantcontract",
    { owner_address: ownerHex41, contract_address: contractHex41, call_value: callValueSun, data: dataNo0x },
    "post",
  )) as TronSimResponse;

  const ok = sim?.result?.result === true;
  if (!ok) {
    const reason = sim?.result?.message ? hexToUtf8(sim.result.message) : "unknown";
    console.log(`- ${label} energy_used: n/a`);
    console.log(`- ${label} simulation failed (${reason})`);
    return { ok: false as const };
  }
  console.log(`- ${label} energy_used: ${sim.energy_used ?? "n/a"}`);
  return { ok: true as const, energyUsed: sim.energy_used ?? 0 };
}

/** TRC20: balance/allowance */
async function getUsdtBalanceSun(tronWeb: TronWebNS.TronWeb, ownerBase58: string) {
  const c = await tronWeb.contract().at(USDT_TRC20_BASE58);
  return Number(await c.balanceOf(ownerBase58).call());
}
async function getUsdtAllowanceSun(tronWeb: TronWebNS.TronWeb, ownerBase58: string, spenderBase58: string) {
  const c = await tronWeb.contract().at(USDT_TRC20_BASE58);
  return BigInt(String(await c.allowance(ownerBase58, spenderBase58).call()));
}

/** Build approve calldata (address param in base58, contract in hex41) */
async function buildApproveCalldata(
  tronWeb: TronWebNS.TronWeb,
  ownerHex41: string,
  spenderBase58: string,
  valueSun: string,
) {
  const usdtHex41 = tronWeb.address.toHex(USDT_TRC20_BASE58);
  const res = await tronWeb.transactionBuilder.triggerSmartContract(
    usdtHex41,
    "approve(address,uint256)",
    { callValue: 0 },
    [
      { type: "address", value: spenderBase58 },
      { type: "uint256", value: valueSun },
    ],
    ownerHex41,
  );
  if (!res?.transaction) throw new Error("Failed to build approve tx");
  const dataNo0x = res.transaction.raw_data.contract[0].parameter.value.data;
  return { usdtHex41, dataNo0x };
}

/** Wait until allowance(owner→spender) >= needed (simple polling) */
async function waitForAllowance(
  tronWeb: TronWebNS.TronWeb,
  ownerBase58: string,
  spenderBase58: string,
  needed: bigint,
  timeoutMs = 30000,
  intervalMs = 2000,
) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const cur = await getUsdtAllowanceSun(tronWeb, ownerBase58, spenderBase58);
    if (cur >= needed) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

/** MAIN */
async function main() {
  const { tronWeb, privateKey } = initTronWeb();

  // --- Signer ---
  const senderBase58 = tronWeb.defaultAddress.base58;
  if (!senderBase58) throw new Error("Failed to derive sender address from private key");
  const senderHex41 = tronWeb.address.toHex(senderBase58);

  // 1) Create order to get mutated amount and tx data
  const orderInput: deBridgeOrderInput = {
    srcChainId: "100000026",
    srcChainTokenIn: USDT_TRC20_BASE58,
    srcChainTokenInAmount: String(Math.round(BRIDGE_AMOUNT_USDT * 1e6)),
    dstChainId: SOLANA_CHAIN_ID,
    dstChainTokenOut: SOL_NATIVE,
    dstChainTokenOutRecipient: SOLANA_RECIPIENT,
    account: senderBase58,
    srcChainOrderAuthorityAddress: senderBase58,
    dstChainOrderAuthorityAddress: SOLANA_RECIPIENT,
  };
  const order: any = await createDebridgeBridgeOrder(orderInput);
  if (!order?.tx?.to || !order?.tx?.data) throw new Error("Invalid order");

  // Only the final mutated amount (post-prepend) we must approve/transfer
  const requiredUsdtSun = String(
    order?.estimation?.srcChainTokenIn?.amount ?? Math.round(BRIDGE_AMOUNT_USDT * 1e6),
  );
  console.log(`required_usdt_sun: ${requiredUsdtSun}`);

  // Spender IS the deBridge contract (order.tx.to)
  const debridgeRouterBase58 =
    order.tx.to.startsWith("0x")
      ? tronWeb.address.fromHex(`41${order.tx.to.slice(2)}`)
      : order.tx.to;

  // 2) Ensure USDT balance and allowance (gated by allowance)
  const usdtBalSun = await getUsdtBalanceSun(tronWeb, senderBase58);
  if (BigInt(usdtBalSun) < BigInt(requiredUsdtSun)) {
    throw new Error("Insufficient USDT balance");
  }

  const currentAllowance = await getUsdtAllowanceSun(tronWeb, senderBase58, debridgeRouterBase58);
  if (currentAllowance < BigInt(requiredUsdtSun)) {
    const { usdtHex41, dataNo0x } = await buildApproveCalldata(
      tronWeb,
      senderHex41,
      debridgeRouterBase58, // spender = deBridge Router
      requiredUsdtSun,
    );

    // Simulate approve
    const simApprove = await simulateCall(tronWeb, `approve(${Number(requiredUsdtSun) / 1e6} USDT)`, senderHex41, usdtHex41, 0, dataNo0x);
    if (!simApprove.ok) throw new Error("approve(required) simulation failed");

    const energyPriceSun = await getEnergyPriceSun(tronWeb);
    const feeLimitApprove = calcFeeLimit(simApprove.energyUsed!, energyPriceSun, 1.3);

    // Send approve(required)
    const unsignedApprove = await tronWeb.transactionBuilder.triggerSmartContract(
      usdtHex41,
      "approve(address,uint256)",
      { callValue: 0, feeLimit: feeLimitApprove },
      [
        { type: "address", value: debridgeRouterBase58 },
        { type: "uint256", value: requiredUsdtSun },
      ],
      senderHex41,
    );
    if (!unsignedApprove?.result?.result) throw new Error("approve(required) build failed");
    const signedApprove = await tronWeb.trx.sign(unsignedApprove.transaction, privateKey);
    const approveReceipt = await tronWeb.trx.sendRawTransaction(signedApprove);
    if (approveReceipt.code || !approveReceipt.result) throw new Error("approve(required) broadcast failed");
    console.log(`- approve tx: ${approveReceipt.txid}`);

    // Re-read allowance until >= required (so the bridge sim sees the updated state)
    const ok = await waitForAllowance(tronWeb, senderBase58, debridgeRouterBase58, BigInt(requiredUsdtSun));
    if (!ok) throw new Error("Allowance not updated in time after approve");
  }

  // 3) Simulate and SEND the bridge tx
  const bridgeContractHex41 =
    order.tx.to.startsWith("0x")
      ? `41${order.tx.to.slice(2)}`
      : tronWeb.address.toHex(order.tx.to);
  const bridgeDataNo0x = order.tx.data.startsWith("0x") ? order.tx.data.slice(2) : order.tx.data;
  const bridgeCallValueSun = Number(order?.fixFee ?? 0);

  const simBridge = await simulateCall(
    tronWeb,
    "bridge",
    senderHex41,
    bridgeContractHex41,
    bridgeCallValueSun,
    bridgeDataNo0x,
  );
  if (!simBridge.ok) throw new Error("bridge simulation failed");

  const energyPriceSunBridge = await getEnergyPriceSun(tronWeb);
  const feeLimitBridge = calcFeeLimit(simBridge.energyUsed!, energyPriceSunBridge, 1.3);

  const unsignedBridge = await tronWeb.transactionBuilder.triggerSmartContract(
    bridgeContractHex41,
    "",
    { callValue: bridgeCallValueSun, input: bridgeDataNo0x, feeLimit: feeLimitBridge },
    [],
    senderHex41,
  );
  if (!unsignedBridge?.result?.result) throw new Error("bridge build failed");
  const signedBridge = await tronWeb.trx.sign(unsignedBridge.transaction, privateKey);
  const bridgeReceipt = await tronWeb.trx.sendRawTransaction(signedBridge);
  if (bridgeReceipt.code || !bridgeReceipt.result) throw new Error("bridge broadcast failed");
  console.log("TX Hash:", bridgeReceipt.txid);
  console.log(`TronScan: https://tronscan.org/#/transaction/${bridgeReceipt.txid}`);
}

main().catch((e) => {
  console.error("\nFATAL ERROR:", e?.message ?? e);
  process.exitCode = 1;
});
