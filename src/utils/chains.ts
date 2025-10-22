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
  Neon: 100000001,
  Gnosis: 100000002,
  // Lightlink: 100000003, // Suspended
  Metis: 100000004,
  Bitrock: 100000005,
  Sonic: 100000014,
  CrossFi: 100000006,
  Cronos: 100000010,
  Abstract: 100000017,
  Berachain: 100000020,
  Story: 100000013,
  HyperEVM: 100000022,
  Zircuit: 100000015,
  Flow: 100000009,
  Zilliqa: 100000008,
  BOB: 100000021,
  Mantle: 100000023,
  Plume: 100000024,
  Sophon: 100000025,
  TRON: 100000026,
  Sei: 100000027,
  Plasma: 100000028,
}