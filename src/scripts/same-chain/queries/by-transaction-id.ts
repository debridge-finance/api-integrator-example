import { get } from "../../../utils/http";

async function main() {
  const chainId = 137; // Example chain ID (Polygon)
  const transactionHash = '0xdefcfc8ee63ce48a8b19a34f289d6cf90d6b722b2d8df74083aa197c6c43d537'; // Transaction hash
  const URL = `https://stats-api.dln.trade/api/SameChainSwap/${chainId}/tx/${transactionHash}`;

  const data = await get(URL);

  console.log(data);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exitCode = 1;
});
