import "dotenv/config";
import { createDebridgeBridgeOrder } from "../../utils/deBridge/createDeBridgeOrder";
import { deBridgeOrderInput } from "../../types";
import { getEnvConfig } from "../../utils";
import {
	initTronWeb,
	clipHexPrefix,
	toTronHex41,
	getEnergyPriceSun,
	calcFeeLimit,
	getTRC20Balance,
	getTRC20Allowance,
	buildTRC20ApproveCalldata,
	checkTronTransactionReceipt,
	simulateTriggerContract,
} from "../../utils/tron";

/** Config */
const USDT_TRC20_BASE58 = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const BRIDGE_AMOUNT_USDT = 2;
const SOLANA_CHAIN_ID = "7565164";
const SOLANA_RECIPIENT = "<Solana Address>"; // put your recipient
const SOL_NATIVE = "11111111111111111111111111111111";

/** MAIN */
async function main() {
	const { tronPrivateKey, tronRpcUrl, tronGridApiKey } = getEnvConfig();

	const tronWeb = initTronWeb({
		privateKey: tronPrivateKey,
		rpcUrl: tronRpcUrl,
		apiKey: tronGridApiKey,
	});

	// --- Signer ---
	const senderBase58 = tronWeb.defaultAddress.base58;
	if (!senderBase58) {
		throw new Error("Failed to derive sender address from private key");
	}
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
	if (!order?.tx?.to || !order?.tx?.data) {
		throw new Error("Invalid order");
	}

	// Only the final mutated amount (post-prepend) we must approve/transfer
	const requiredUsdtSun = String(
		order?.estimation?.srcChainTokenIn?.amount ?? Math.round(BRIDGE_AMOUNT_USDT * 1e6)
	);
	console.log(`required_usdt_sun: ${requiredUsdtSun}`);

	// Spender IS the deBridge contract (order.tx.to)
	const debridgeRouterBase58 = order.tx.to.startsWith("0x")
		? tronWeb.address.fromHex(`41${order.tx.to.slice(2)}`)
		: order.tx.to;

	// 2) Ensure USDT balance and allowance (gated by allowance)
	const usdtBalSun = await getTRC20Balance(tronWeb, USDT_TRC20_BASE58, senderBase58);
	if (BigInt(usdtBalSun) < BigInt(requiredUsdtSun)) {
		throw new Error("Insufficient USDT balance");
	}

	const currentAllowance = await getTRC20Allowance(
		tronWeb,
		USDT_TRC20_BASE58,
		senderBase58,
		debridgeRouterBase58
	);
	if (currentAllowance < BigInt(requiredUsdtSun)) {
		const { tokenHex41: usdtHex41, dataNo0x } = await buildTRC20ApproveCalldata(
			tronWeb,
			USDT_TRC20_BASE58,
			senderHex41,
			debridgeRouterBase58, // spender = deBridge Router
			requiredUsdtSun
		);

		// Simulate approve
		const simApprove = await simulateTriggerContract(tronWeb, {
			ownerAddress: senderBase58,
			contractAddress: USDT_TRC20_BASE58,
			callValue: 0,
			data: dataNo0x,
			label: `approve(${Number(requiredUsdtSun) / 1e6} USDT)`,
		});
		if (!simApprove.ok) {
			throw new Error("approve(required) simulation failed");
		}

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
			senderHex41
		);
		if (!unsignedApprove?.result?.result) {
			throw new Error("approve(required) build failed");
		}
		const signedApprove = await tronWeb.trx.sign(unsignedApprove.transaction, tronPrivateKey);
		const approveReceipt = await tronWeb.trx.sendRawTransaction(signedApprove);

		const approveCheck = checkTronTransactionReceipt(approveReceipt);
		if (!approveCheck.success) {
			throw new Error(`approve(required) failed: ${approveCheck.error}`);
		}
		console.log(`- approve tx: ${approveReceipt.txid}`);
	}

	// 3) Simulate and SEND the bridge tx
	const bridgeCallValueSun = Number(order?.fixFee ?? 0);

	const simBridge = await simulateTriggerContract(tronWeb, {
		ownerAddress: senderBase58,
		contractAddress: order.tx.to,
		callValue: bridgeCallValueSun,
		data: order.tx.data,
		label: "bridge",
	});
	if (!simBridge.ok) {
		throw new Error("bridge simulation failed");
	}

	const energyPriceSunBridge = await getEnergyPriceSun(tronWeb);
	const feeLimitBridge = calcFeeLimit(simBridge.energyUsed!, energyPriceSunBridge, 1.3);

	const bridgeContractHex41 = toTronHex41(tronWeb, order.tx.to);
	const bridgeDataNo0x = clipHexPrefix(order.tx.data);

	const unsignedBridge = await tronWeb.transactionBuilder.triggerSmartContract(
		bridgeContractHex41,
		"",
		{ callValue: bridgeCallValueSun, input: bridgeDataNo0x, feeLimit: feeLimitBridge },
		[],
		senderHex41
	);
	if (!unsignedBridge?.result?.result) {
		throw new Error("bridge build failed");
	}
	const signedBridge = await tronWeb.trx.sign(unsignedBridge.transaction, tronPrivateKey);
	const bridgeReceipt = await tronWeb.trx.sendRawTransaction(signedBridge);

	const bridgeCheck = checkTronTransactionReceipt(bridgeReceipt);
	if (!bridgeCheck.success) {
		throw new Error(`bridge transaction failed: ${bridgeCheck.error}`);
	}
	console.log("TX Hash:", bridgeReceipt.txid);
	console.log(`TronScan: https://tronscan.org/#/transaction/${bridgeReceipt.txid}`);
}

main().catch((e) => {
	console.error("\nFATAL ERROR:", e?.message ?? e);
	process.exitCode = 1;
});
