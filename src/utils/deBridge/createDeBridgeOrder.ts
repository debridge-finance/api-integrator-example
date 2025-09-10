import { DEBRIDGE_API } from "../../constants";
import { deBridgeOrderInput, deBridgeOrderResponse } from "../../types";

/**
 * Create a bridge order for cross-chain token transfer
 *
 * @param params Bridge order parameters
 * @param params.srcChainId Source chain ID (e.g., '1' for Ethereum)
 * @param params.srcChainTokenIn Token address on source chain
 * @param params.srcChainTokenInAmount Amount to bridge (in token's smallest unit)
 * @param params.dstChainId Destination chain ID
 * @param params.dstChainTokenOut Token address on destination chain
 * @param params.dstChainTokenOutRecipient Recipient address on destination chain
 * @param params.account Sender's wallet address
 * @returns Bridge order details and transaction data
 */
export async function createDebridgeBridgeOrder(
  params: deBridgeOrderInput,
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
    srcChainRefundAddress: params.account, // Always use sender's address
    dstChainOrderAuthorityAddress: params.dstChainOrderAuthorityAddress || params.dstChainTokenOutRecipient, // Recipient's address as fallback
    referralCode: params.referralCode ? params.referralCode.toString() : "31805", // Damir's work address referral code
    // deBridgeApp: "", 
    prependOperatingExpenses: "true", // Always true
    // NOTE: Both the affiliateFeePercent and affiliateFeeRecipient must be set if you're using one
    affiliateFeePercent: (params.affiliateFeePercent || 0).toString(),
    affiliateFeeRecipient: params.affiliateFeeRecipient ? params.affiliateFeeRecipient : "0x55A8f5cce1d53D9Ff84EC0962882b447E5914dB8" // Damir's work address
  });

  if (queryParams.get("affiliateFeePercent") === "0" || !queryParams.get("affiliateFeeRecipient")) {
    queryParams.delete("affiliateFeePercent");
    queryParams.delete("affiliateFeeRecipient");
  }

  console.log("URL**********",`${DEBRIDGE_API}/dln/order/create-tx?${queryParams}`);

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