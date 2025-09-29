import { DEBRIDGE_API } from "../../constants";
import { SameChainSwapInput, SameChainSwapResponse } from "../../types";

export async function createDeBridgeSameChainSwap(
  params: SameChainSwapInput,
): Promise<SameChainSwapResponse> {

  const queryParams = new URLSearchParams({
    chainId: params.chainId,
    tokenIn: params.tokenIn,
    tokenInAmount: params.tokenInAmount,
    tokenOut: params.tokenOut,
    tokenOutRecipient: params.tokenOutRecipient,
    senderAddress: params.senderAddress || "",
    srcChainPriorityLevel: params.srcChainPriorityLevel || "normal",
    slippage: params.slippage || "auto",
    referralCode: params.referralCode ? params.referralCode.toString() : "31805", // Damir's work address referral code
    // NOTE: Both the affiliateFeePercent and affiliateFeeRecipient must be set if you're using one
    affiliateFeePercent: (params.affiliateFeePercent || 0).toString(),
    affiliateFeeRecipient: params.affiliateFeePercent ? "0x55A8f5cce1d53D9Ff84EC0962882b447E5914dB8" : "" // Damir's work address
  });

  if (queryParams.get("affiliateFeePercent") === "0" || !queryParams.get("affiliateFeeRecipient")) {
    queryParams.delete("affiliateFeePercent");
    queryParams.delete("affiliateFeeRecipient");
  }

  console.log("URL**********", `${DEBRIDGE_API}/chain/transaction?${queryParams}`);

  const response = await fetch(
    `${DEBRIDGE_API}/chain/transaction?${queryParams}`,
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