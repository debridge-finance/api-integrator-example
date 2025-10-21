import * as TronWebNS from "tronweb";

/** Remove "0x" prefix if present */
export function clipHexPrefix(hex: string): string {
	return hex.startsWith("0x") ? hex.slice(2) : hex;
}

/** Convert hex string to UTF-8 (useful for error messages) */
export function hexToUtf8(hex?: string): string {
	if (!hex) return "";
	const clean = clipHexPrefix(hex);
	try {
		return Buffer.from(clean, "hex").toString("utf8");
	} catch {
		return "";
	}
}

/** Convert an address to Tron hex41 format */
export function toTronHex41(tronWeb: TronWebNS.TronWeb, address: string): string {
	if (address.startsWith("0x")) {
		return `41${address.slice(2)}`;
	}
	return tronWeb.address.toHex(address);
}

/** Initialize TronWeb client */
export function initTronWeb(config: {
	privateKey: string;
	rpcUrl: string;
	apiKey?: string;
}) {
	const tronWeb = new TronWebNS.TronWeb({
		fullHost: config.rpcUrl,
		headers: config.apiKey ? { "TRON-PRO-API-KEY": config.apiKey } : undefined,
		privateKey: config.privateKey,
	});
	return tronWeb;
}

/** Response type for TriggerConstantContract simulation */
export interface TronTriggerConstantContractResponse {
	result?: { result?: boolean; message?: string };
	constant_result?: string[];
	logs?: unknown[];
	energy_used?: number;
	energy_penalty?: number;
	transaction?: { txID?: string };
}

/** Simulate a smart contract call with detailed response */
export async function simulateTriggerContract(
	tronWeb: TronWebNS.TronWeb,
	params: {
		ownerAddress: string;
		contractAddress: string;
		callValue: number;
		data: string;
		label?: string;
	}
): Promise<{ ok: boolean; energyUsed?: number; error?: string }> {
	const dataNo0x = clipHexPrefix(params.data);
	const ownerHex41 = toTronHex41(tronWeb, params.ownerAddress);
	const contractHex41 = toTronHex41(tronWeb, params.contractAddress);

	const sim = (await tronWeb.fullNode.request(
		"wallet/triggerconstantcontract",
		{
			owner_address: ownerHex41,
			contract_address: contractHex41,
			call_value: params.callValue,
			data: dataNo0x,
		},
		"post"
	)) as TronTriggerConstantContractResponse;

	const ok = sim?.result?.result === true;
	const label = params.label || "simulation";

	if (!ok) {
		const reason = sim?.result?.message ? hexToUtf8(sim.result.message) : "unknown";
		console.log(`- ${label} energy_used: n/a`);
		console.log(`- ${label} simulation failed (${reason})`);
		return { ok: false, error: reason };
	}

	console.log(`- ${label} energy_used: ${sim.energy_used ?? "n/a"}`);
	return { ok: true, energyUsed: sim.energy_used ?? 0 };
}

/** Get current energy price from chain parameters */
export async function getEnergyPriceSun(
	tronWeb: TronWebNS.TronWeb
): Promise<number> {
	const params = await tronWeb.trx.getChainParameters();
	const v = Number(params.find((p: any) => p.key === "getEnergyFee")?.value);
	if (!Number.isFinite(v)) {
		throw new Error("getEnergyFee not found in chain parameters");
	}
	return v;
}

/** Calculate fee limit with buffer */
export function calcFeeLimit(
	energyUsed: number,
	energyPriceSun: number,
	bufferFactor = 1.3
): number {
	return Math.ceil(energyUsed * energyPriceSun * bufferFactor);
}

/** Check if a transaction broadcast was successful */
export function checkTronTransactionReceipt(receipt: any): {
	success: boolean;
	error?: string;
} {
	// Check for error code
	if (receipt.code) {
		const errMsg = hexToUtf8(receipt.message);
		return {
			success: false,
			error: `Transaction failed with code ${receipt.code}: ${errMsg}`,
		};
	}

	// Check result field - note: receipt.result is a boolean, not a string
	// "result: true" means the transaction was accepted by the network
	// But it doesn't guarantee the transaction succeeded - need to check receipt details
	if (!receipt.result) {
		return {
			success: false,
			error: "Transaction broadcast failed (result: false)",
		};
	}

	return { success: true };
}

/** TRC20 Token Operations */

/** Get TRC20 token balance */
export async function getTRC20Balance(
	tronWeb: TronWebNS.TronWeb,
	tokenAddress: string,
	ownerAddress: string
): Promise<number> {
	const contract = await tronWeb.contract().at(tokenAddress);
	return Number(await contract.balanceOf(ownerAddress).call());
}

/** Get TRC20 token allowance */
export async function getTRC20Allowance(
	tronWeb: TronWebNS.TronWeb,
	tokenAddress: string,
	ownerAddress: string,
	spenderAddress: string
): Promise<bigint> {
	const contract = await tronWeb.contract().at(tokenAddress);
	return BigInt(String(await contract.allowance(ownerAddress, spenderAddress).call()));
}

/** Build TRC20 approve transaction calldata */
export async function buildTRC20ApproveCalldata(
	tronWeb: TronWebNS.TronWeb,
	tokenAddress: string,
	ownerHex41: string,
	spenderBase58: string,
	amountSun: string
) {
	const tokenHex41 = toTronHex41(tronWeb, tokenAddress);
	const res = await tronWeb.transactionBuilder.triggerSmartContract(
		tokenHex41,
		"approve(address,uint256)",
		{ callValue: 0 },
		[
			{ type: "address", value: spenderBase58 },
			{ type: "uint256", value: amountSun },
		],
		ownerHex41
	);
	if (!res?.transaction) {
		throw new Error("Failed to build approve transaction");
	}
	const dataNo0x = res.transaction.raw_data.contract[0].parameter.value.data;
	return { tokenHex41, dataNo0x };
}


