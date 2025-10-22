export async function getOrderIdByTransactionHash(txHash: string) {
  const URL = `https://stats-api.dln.trade/api/Transaction/${txHash}/orderIds`;

  const response = await fetch(URL);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to get orderId by transaction hash: ${response.statusText}. ${errorText}`,
    );
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`DeBridge API Error: ${data.error}`);
  }

  return data;
}

export async function getOrderStatusByOrderId(orderId: string) {
  const URL = `https://stats-api.dln.trade/api/Orders/${orderId}`

  const response = await fetch(URL);
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to get order status by orderId: ${response.statusText}. ${errorText}`,
    );
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`DeBridge API Error: ${data.error}`);
  }

  return data;
}
