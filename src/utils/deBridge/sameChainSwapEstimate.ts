import { DEBRIDGE_API } from "../../constants";
import { SameChainSwapEstimateInput, SameChainSwapEstimateResponse } from "../../types";

export async function createDeBridgeSameChainSwapEstimate(
  params: SameChainSwapEstimateInput,
): Promise<SameChainSwapEstimateResponse> {

  const queryParams = new URLSearchParams({
    chainId: params.chainId,
    tokenIn: params.tokenIn,
    tokenInAmount: params.tokenInAmount,
    tokenOut: params.tokenOut,
    slippage: params.slippage || "auto",
    // NOTE: Both the affiliateFeePercent and affiliateFeeRecipient must be set if you're using one
    // affiliateFeePercent: (params.affiliateFeePercent || 0).toString(),
    // affiliateFeeRecipient: params.affiliateFeePercent ? "0x55A8f5cce1d53D9Ff84EC0962882b447E5914dB8" : "" // Damir's work address
  });

  console.log("URL**********",`${DEBRIDGE_API}/chain/estimation?${queryParams}`);

  const response = await fetch(
    `${DEBRIDGE_API}/chain/estimation?${queryParams}`,
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