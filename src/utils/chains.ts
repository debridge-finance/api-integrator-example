/**
 * Chain IDs for supported blockchains.
 * 
 * deBridge uses internal chain IDs which may differ from standard ones for some chains. 
 * 
 * ChainIDs can be fetched by calling deBridge API: https://dln.debridge.finance/v1.0/supported-chains-info
 * 
 * Supported Chains docs: https://docs.debridge.com/dln-details/overview/fees-supported-chains
 * 
 * Endpoint docs: https://docs.debridge.com/api-reference/utils/get-v10supported-chains-info
 */
export const CHAIN_IDS = {
  Arbitrum: 42161,
  Avalanche: 43114,
  BNB: 56,
  Ethereum: 1,
  Polygon: 137,
  Fantom: 250,
  Solana: 7565164,
  Linea: 59144,
  Optimism: 10,
  Base: 8453,
  Story: 100000013,
  HyperEVM: 100000022,
  Flow: 100000009,
  Plume: 100000024,
  TRON: 100000026,
  Sei: 100000027,
  MegaETH: 100000031
}