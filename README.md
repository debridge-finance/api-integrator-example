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

