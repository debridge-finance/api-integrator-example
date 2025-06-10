import { post } from "../../../utils/http";

const ADDRESS = '0x441bc84aa07a71426f4d9a40bc40ac7183d124b9';

async function main() {
  const URL = 'https://stats-api.dln.trade/api/Orders/filteredList';

  const requestBody = {
    giveChainIds: [],
    takeChainIds: [],
    // All of these order states are considered to be fulfilled 
    // from the end-user's perspective
    orderStates: ['Fulfilled', 'SentUnlock', 'ClaimedUnlock' ],
    externalCallStates: ['NoExtCall'],
    skip: 0,
    take: 10,
    maker: ADDRESS,
  };

  const data = await post(URL, requestBody);

  console.log(data);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exitCode = 1;
});
