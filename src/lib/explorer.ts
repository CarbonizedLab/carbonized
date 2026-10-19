import { isMainnetNetwork } from '@/lib/network';

const MAINNET_EXPLORER = 'https://robinhoodchain.blockscout.com';
const TESTNET_EXPLORER = 'https://explorer.testnet.chain.robinhood.com';

/**
 * Block explorer for the configured Robinhood Chain network (mainnet when
 * `NEXT_PUBLIC_NETWORK=robinhood-mainnet`, testnet otherwise); override with
 * `NEXT_PUBLIC_EXPLORER_URL`.
 */
export const EXPLORER_BASE_URL = (
  process.env.NEXT_PUBLIC_EXPLORER_URL ||
  (isMainnetNetwork ? MAINNET_EXPLORER : TESTNET_EXPLORER)
).replace(/\/$/, '');

export const explorerTxUrl = (hash: string): string =>
  `${EXPLORER_BASE_URL}/tx/${hash}`;

export const explorerAddressUrl = (address: string): string =>
  `${EXPLORER_BASE_URL}/address/${address}`;

export const explorerBlockUrl = (block: bigint | number): string =>
  `${EXPLORER_BASE_URL}/block/${block}`;
