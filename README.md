# API Integrator Example

This repository contains examples of various scripts, covering the basic integration scenarios. The goal is to provide hands-on examples that can be further extended for the intended use-cases.

These examples will consume some of your funds if not changed.
 
The code is provided as-is, without any guarantees that it will work. We are not responsible for any damages incurred by running it.

## Prerequisites

The prerequisites for running it are:
- NodeJS 18+
- installing dependencies
- A `.env` file in the project root

## Environment Variables 
There are several environment variables you need to set in the `.env.` file:
```bash
SIGNER_PK="0x......"
SOL_PK="..."
POLYGON_RPC_URL="https://polygon-mainnet.g.alchemy.com/v2/<api_key>"
BNB_RPC_URL="https://bnb-mainnet.g.alchemy.com/v2/<api_key>"
ARB_RPC_URL="https://arb-mainnet.g.alchemy.com/v2/<api_key>"
SOL_RPC_URL="https://solana-mainnet.g.alchemy.com/v2/<api_key>"
```

## Installing Dependencies

To quickly switch to a supported node version:

```bash
nvm use
```

To install the dependencies, run:
```bash
npm install
```

## Running The Scripts

One of the ways of running the scripts is:
```bash
npx tsx ./src/scripts/orders/example-swap.ts
```


## Solana Transaction Versions (v0 / v1)

When the source chain is Solana, both `/dln/order/create-tx` and `/chain/transaction` accept a `solanaTransactionVersion` query parameter that selects the format of the returned transaction:

| Value | Format | Lookup tables | Size limit | Compute budget |
|---|---|---|---|---|
| `0` (default) | versioned v0 | yes | 1232 bytes | `ComputeBudget` instructions prepended by the API |
| `1` | SIMD-0385 v1 | no, all addresses inline | 4096 bytes | carried in the message config: priority fee (lamports), CU limit, loaded-accounts-data limit |

The `solana-v1-*` scripts request v1 and show the full flow: decode the API response, refresh the blockhash, simulate, set the compute budget, sign and broadcast with `sendRawTransaction` (base64 encoded, required above 1232 bytes).

```bash
npx tsx ./src/scripts/same-chain/solana-v1-usdc-to-sol.ts
npx tsx ./src/scripts/orders/solana-v1-usdc-to-poly.ts
npx tsx ./src/scripts/orders/solana-v1-sol-to-poly.ts
```

Signing a v1 transaction needs `@solana/web3.js` v3 (v1.x can decode v1 but cannot serialize or sign it). Because `@debridge-finance/dln-client` and `@debridge-finance/solana-utils` still declare a peer dependency on `@solana/web3.js` v1, v3 is installed under an alias and imported as `web3js-v3`:

```bash
npm install web3js-v3@npm:@solana/web3.js@3
```

The v3 API keeps the familiar classes (`Connection`, `Keypair`, `VersionedTransaction`), with `Keypair.fromSecretKey` and `VersionedTransaction.sign` now returning promises. All other scripts in this repository keep using `@solana/web3.js` v1.
