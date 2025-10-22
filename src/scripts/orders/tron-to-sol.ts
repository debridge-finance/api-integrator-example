import "dotenv/config";
import { createDebridgeBridgeOrder } from "../../utils/deBridge/createDeBridgeOrder";
import { deBridgeOrderInput } from "../../types";
import { getEnvConfig } from "../../utils";
import {
	initTronWeb,
	simulateTriggerContract,
	clipHexPrefix,
	calcFeeLimit,
	toTronHex41,
	checkTronTransactionReceipt,
} from "../../utils/tron";
import { CHAIN_IDS } from "../../utils/chains";
import { SOL, TRX } from "../../utils/tokens";

async function main() {
	// --- ENV ---
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
	// --- Current balance ---
	const balanceSun = await tronWeb.trx.getBalance(senderBase58);
	const balanceTrx = balanceSun / 1e6;

	// --- Bridge parameters ---
	const SOLANA_RECIPIENT = "862oLANNqhdXyUCwLJPBqUHrScrqNR4yoGWGTxjZftKs";

	const amountTRX = 5;
	const amountSun = String(amountTRX * 1e6);

	// --- Create order ---
	const orderInput: deBridgeOrderInput = {
		srcChainId: CHAIN_IDS.TRON.toString(),
		srcChainTokenIn: TRX.sentinel,
		srcChainTokenInAmount: amountSun,
		dstChainId: CHAIN_IDS.Solana.toString(),
		dstChainTokenOut: SOL.nativeSol,
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
	const sim = await simulateTriggerContract(tronWeb, {
		ownerAddress: senderBase58,
		contractAddress: order.tx.to,
		callValue: Number(order.tx.value),
		data: order.tx.data,
		label: "bridge",
	});

	if (!sim.ok) {
		throw new Error(`Simulation failed: ${sim.error}`);
	}

	// --- Balance precheck ---
	const estimatedEnergy = sim.energyUsed ?? 0;
	const energyPriceSun = order.estimatedTransactionFee.details.gasPrice;
	const feeBufferFactor = 1.3;
	const feeLimit = calcFeeLimit(estimatedEnergy, energyPriceSun, feeBufferFactor);

	const callValueSun = Number(order.tx.value);
	const totalRequiredSun = callValueSun + feeLimit;

	console.log("=== Balance precheck ===");
	console.log("Current balance (TRX):", balanceTrx.toFixed(6));
	console.log("callValue (TRX):      ", (callValueSun / 1e6).toFixed(6));
	console.log(
		"feeLimit (TRX):       ",
		(feeLimit / 1e6).toFixed(6),
		`(energy=${estimatedEnergy}, gasPrice=${energyPriceSun} SUN, buffer=${Math.round((feeBufferFactor - 1) * 100)}%)`,
	);
	console.log("total required (TRX): ", (totalRequiredSun / 1e6).toFixed(6));

	if (balanceSun < totalRequiredSun) {
		const missing = (totalRequiredSun - balanceSun) / 1e6;
		throw new Error(`Insufficient balance. Missing ~${missing.toFixed(6)} TRX`);
	} else {
		console.log("Sufficient balance detected");
	}

	// --- REAL TX ---
	const callDataHexNo0x = clipHexPrefix(order.tx.data);
	const signerHex41Maybe = tronWeb.defaultAddress.hex;
	if (!signerHex41Maybe) {
		throw new Error("Failed to read defaultAddress.hex");
	}
	const signerHex41: string = signerHex41Maybe;
	const contractHex41 = toTronHex41(tronWeb, order.tx.to);

	const unsigned = await tronWeb.transactionBuilder.triggerSmartContract(
		contractHex41,
		"",
		{ callValue: callValueSun, input: callDataHexNo0x, feeLimit },
		[],
		signerHex41,
	);

	if (!unsigned.result?.result) {
		throw new Error("Failed to build transaction");
	}
	console.log("PreparedTx:", unsigned?.transaction?.txID ?? "n/a");

	const signed = await tronWeb.trx.sign(unsigned.transaction, tronPrivateKey);
	const receipt = await tronWeb.trx.sendRawTransaction(signed);

	const receiptCheck = checkTronTransactionReceipt(receipt);
	if (!receiptCheck.success) {
		throw new Error(receiptCheck.error);
	}

	console.log("TX Hash:", receipt.txid);
	console.log(`TronScan: https://tronscan.org/#/transaction/${receipt.txid}`);
}

main().catch((err) => {
	console.error("FATAL ERROR:", err?.message ?? err);
	process.exitCode = 1;
});
