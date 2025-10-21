import { getOrderIdByTransactionHash } from "../../../utils/deBridge"

async function main() {
  const txHash = "0x924576a5af247945c3091e95f08c223a0a36c190527748fe209a8ecb6b0cb9c7" // Set your tx hash here

  const { orderIds } = await getOrderIdByTransactionHash(txHash)

  if (orderIds && orderIds.length > 0) {
    const orderId = orderIds[0].stringValue;
    console.log(orderId)
  }
}

main()