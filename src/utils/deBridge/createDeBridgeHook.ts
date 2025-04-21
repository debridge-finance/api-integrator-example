import { DEBRIDGE_API } from "../../constants";
import { deBridgeHookInput, deBridgeOrderResponse } from "../../types";

/**
 * Create a bridge order for cross-chain token transfer with a hook
 *
 * @param params Bridge order parameters
 * @param params.srcChainId Source chain ID (e.g., '1' for Ethereum)
 * @param params.srcChainTokenIn Token address on source chain
 * @param params.srcChainTokenInAmount Amount to bridge (in token's smallest unit)
 * @param params.dstChainId Destination chain ID
 * @param params.dstChainTokenOut Token address on destination chain
 * @param params.dstChainTokenOutRecipient Recipient address on destination chain
 * @param params.account Sender's wallet address
 * @param params.dlnHook Hook to be executed on the destination chain
 * @returns Bridge order details and transaction data
 */
export async function createDebridgeBridgeHook(
  params: deBridgeHookInput,
): Promise<deBridgeOrderResponse> {
  if (params.srcChainId === params.dstChainId) {
    throw new Error("Source and destination chains must be different");
  }

  const queryParams = new URLSearchParams({
    srcChainId: params.srcChainId,
    srcChainTokenIn: params.srcChainTokenIn,
    srcChainTokenInAmount: params.srcChainTokenInAmount,
    dstChainId: params.dstChainId,
    dstChainTokenOut: params.dstChainTokenOut,
    dstChainTokenOutRecipient: params.dstChainTokenOutRecipient,
    dstChainTokenOutAmount: params.dstChainTokenOutAmount || "auto",
    senderAddress: params.account,
    srcChainOrderAuthorityAddress: params.srcChainOrderAuthorityAddress || params.account, // Sender's address as fallback
    // TODO: Explain pre-swap 
    srcChainRefundAddress: params.account, // Using the sender's address to receive refunds (Extra value from slippage after a pre-swap)
    dstChainOrderAuthorityAddress: params.dstChainOrderAuthorityAddress || params.dstChainTokenOutRecipient, // Recipient's address as fallback
    referralCode: "31805", // Damir's work address referral code
    // deBridgeApp: "", 
    prependOperatingExpenses: "true", // Always true
    // NOTE: Look at createDeBridgeOrder for explanation on affiliateFee params
    // affiliateFeePercent: (params.affiliateFeePercent || 0).toString(),
    // affiliateFeeRecipient: params.affiliateFeePercent ? "0x55A8f5cce1d53D9Ff84EC0962882b447E5914dB8" : "" // Damir's work address
    dlnHook: JSON.stringify(params.dlnHook)
  });

  const response = await fetch(
    `${DEBRIDGE_API}/dln/order/create-tx?${queryParams}`,
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to create bridge order: ${response.statusText}. ${errorText}`,
    );
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`DeBridge API Error: ${data.error}`);
  }

  if (data.tx?.data) {
    data.tx.data = data.tx.data.toString();
  }

  return data;
}