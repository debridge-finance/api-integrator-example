import { post } from "../../../utils/http";

async function main() {
  const URL = 'https://stats-api.dln.trade/api/Orders/filteredList';

  const requestBody = {
    skip: 0,
    take: 10,
    filterMode: "SameChain", // Default value: "CrossChain", possible values are "CrossChain", "SameChain", "Mixed"
    referralCode: 31805 // Damir's work address referral code
  };

  const data = await post(URL, requestBody);

  console.log(data);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exitCode = 1;
});
