import { post } from "../../../utils/http";

const ADDRESS = '0x55A8f5cce1d53D9Ff84EC0962882b447E5914dB8';

async function main() {
  const URL = 'https://stats-api.dln.trade/api/Orders/filteredList';

  const requestBody = {
    skip: 0,
    take: 10,
    maker: ADDRESS,
    filterMode: "SameChain" // Default value: "CrossChain", possible values are "CrossChain", "SameChain", "Mixed"
  };

  const data = await post(URL, requestBody);

  console.log(data);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exitCode = 1;
});
