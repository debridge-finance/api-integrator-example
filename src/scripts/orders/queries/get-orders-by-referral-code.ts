import { post } from "../../../utils/http";

async function main() {
  const URL = 'https://stats-api.dln.trade/api/Orders/filteredList';

  const requestBody = {
    giveChainIds: [],
    // All of these are considered to be fulfilled 
    // from the end-user's perspective
    orderStates: ['Fulfilled', 'SentUnlock', 'ClaimedUnlock' ],
    externalCallStates: ['NoExtCall'],
    skip: 0,
    take: 3,
    referralCode: "31805",
  };

  const data = await post(URL, requestBody);

  console.log(data);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exitCode = 1;
});
