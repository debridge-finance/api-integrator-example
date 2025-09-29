import { get } from "../../../utils/http";

async function main() {
  const chainId = 137; // Example chain ID (Polygon)
  const transactionHash = '<setTransactionHash>'; // Transaction hash
  const URL = `https://stats-api.dln.trade/api/SameChainSwap/${chainId}/tx/${transactionHash}`;

  const data = await get(URL);

  console.log(data);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exitCode = 1;
});
