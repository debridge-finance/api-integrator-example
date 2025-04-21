import { getOrderStatusByOrderId } from "../../../utils/deBridge"

async function main() {
  // Set your orderId here - get it by calling the script from get-order-id.ts
  const orderId = "0xa4d57d3156f9d5322542f344ba29fc4cd58d973e2ca8aa94c039ca8b05f869f5" 

  console.log(await getOrderStatusByOrderId(orderId))
}

main()