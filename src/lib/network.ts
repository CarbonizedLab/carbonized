/**
 * Network selection shared by server and client code. Kept free of wagmi /
 * Reown imports so it can be used from server components (landing page,
 * layouts) without pulling the wallet stack in.
 *
 * `NEXT_PUBLIC_NETWORK` values:
 * - `robinhood-mainnet`  Robinhood Chain mainnet (chain id 4663, canonical USDG)
 * - `robinhood`          Robinhood Chain testnet (chain id 46630); alias `robinhood-testnet`
 * - `sepolia` | `amoy` | `polygon` | `hardhat`  other EVM targets
 */
export const ROBINHOOD_MAINNET_NETWORK = 'robinhood-mainnet';
export const ROBINHOOD_MAINNET_CHAIN_ID = 4663;
export const ROBINHOOD_TESTNET_CHAIN_ID = 46_630;

/** True only for the production deployment; everything else is a test environment. */
export const isMainnetNetwork =
  process.env.NEXT_PUBLIC_NETWORK === ROBINHOOD_MAINNET_NETWORK;
