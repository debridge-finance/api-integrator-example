import { getOrderIdByTransactionHash } from "../../../utils/deBridge"

async function main() {
  const txHash = "0x24c0dcc5de8b1ab048e10149c410ce59c1e1058d083ffdad6d8b6acb445618f1" // Set your tx hash here

  console.log(await getOrderIdByTransactionHash(txHash))
}

main()