import { Reader } from "ethers/lib.commonjs/abi/coders/abstract-coder";
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
    take: 20,
    referralCode: "30830",
    blockTimestampFrom: 1758806388
  };

  const data = await post(URL, requestBody);

  for (const order of data.orders) {
    console.log(`OrderId: ${order.orderId.stringValue}`);
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exitCode = 1;
});
