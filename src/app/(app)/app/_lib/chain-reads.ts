import { type PublicClient, parseAbi, parseAbiItem } from 'viem';
import { CONTRACTS } from '@/config/contracts';
import { getLogsChunked, getLogsClient } from '@/lib/logs-client';
import { resolveFromBlock } from '@/lib/onchain-events';
import type {
  GlobalStats,
  Methodology,
  PoolSnapshot,
  PricePoint,
} from './types';

const WAD = 1e18;
const ORACLE_METHODOLOGY = 'VERRA_VCS';
const PRICE_HISTORY_LIMIT = 30;
const ORACLE_PRICE_DECIMALS = 1e8;

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const ZERO_ADDRESS_PATTERN = /^0x0{40}$/;

export const isConfiguredAddress = (value?: string): value is `0x${string}` =>
  Boolean(
    value && ADDRESS_PATTERN.test(value) && !ZERO_ADDRESS_PATTERN.test(value)
  );

const NFT_ABI = parseAbi([
  'function getGlobalStats() view returns (uint256 minted, uint256 retired, uint256 active, uint256 totalTokens)',
  'function userRetiredTonnes(address user) view returns (uint256)',
]);

const TOKEN_ABI = parseAbi([
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
]);

const PRICE_UPDATED_EVENT = parseAbiItem(
  'event PriceUpdated(string indexed methodology, uint256 price, uint256 volume24h, uint8 confidence, uint256 timestamp)'
);

/**
 * CCT pools, one per methodology. VERRA_VCS is the marketplace token and comes
 * from the shared config; the other two are optional env vars written by
 * `npm run update:carb` in carb-contracts.
 */
const POOL_ADDRESSES: { methodology: Methodology; address: string }[] = [
  { methodology: 'VERRA_VCS', address: CONTRACTS.carbonCreditToken },
  {
    methodology: 'ICM_COMPLIANCE',
    address: process.env.NEXT_PUBLIC_CARBON_CREDIT_TOKEN_ICM_COMPLIANCE ?? '',
  },
  {
    methodology: 'GOLD_STANDARD',
    address: process.env.NEXT_PUBLIC_CARBON_CREDIT_TOKEN_GOLD_STANDARD ?? '',
  },
];

export const readGlobalStats = async (
  client: PublicClient
): Promise<GlobalStats | null> => {
  if (!isConfiguredAddress(CONTRACTS.carbonCreditNFT)) {
    return null;
  }
  const [minted, retired, active] = await client.readContract({
    address: CONTRACTS.carbonCreditNFT,
    abi: NFT_ABI,
    functionName: 'getGlobalStats',
  });
  return {
    mintedTonnes: Number(minted) / WAD,
    retiredTonnes: Number(retired) / WAD,
    activeCredits: Number(active),
  };
};

export const readWalletRetiredTonnes = async (
  client: PublicClient,
  account: `0x${string}`
): Promise<number> => {
  if (!isConfiguredAddress(CONTRACTS.carbonCreditNFT)) {
    return 0;
  }
  const retired = await client.readContract({
    address: CONTRACTS.carbonCreditNFT,
    abi: NFT_ABI,
    functionName: 'userRetiredTonnes',
    args: [account],
  });
  return Number(retired) / WAD;
};

export const readPools = async (
  client: PublicClient,
  account?: `0x${string}`
): Promise<PoolSnapshot[]> => {
  const pools = POOL_ADDRESSES.filter(
    (pool): pool is { methodology: Methodology; address: `0x${string}` } =>
      isConfiguredAddress(pool.address)
  );
  return await Promise.all(
    pools.map(async ({ methodology, address }) => {
      const [supply, balance] = await Promise.all([
        client.readContract({
          address,
          abi: TOKEN_ABI,
          functionName: 'totalSupply',
        }),
        account
          ? client.readContract({
              address,
              abi: TOKEN_ABI,
              functionName: 'balanceOf',
              args: [account],
            })
          : Promise.resolve(0n),
      ]);
      return {
        methodology,
        supply: Number(supply) / WAD,
        balance: Number(balance) / WAD,
      };
    })
  );
};

/** Oracle price history (8 decimals) from `PriceUpdated` events; empty when the oracle was never updated. */
export const readPriceHistory = async (
  client: PublicClient
): Promise<PricePoint[]> => {
  if (!isConfiguredAddress(CONTRACTS.carbonPriceOracle)) {
    return [];
  }
  const latest = await client.getBlockNumber();
  const logs = await getLogsChunked<{
    args: { timestamp?: bigint; price?: bigint };
  }>(getLogsClient(client), {
    address: CONTRACTS.carbonPriceOracle,
    event: PRICE_UPDATED_EVENT,
    args: { methodology: ORACLE_METHODOLOGY },
    fromBlock: resolveFromBlock(latest),
    toBlock: latest,
  });
  return logs
    .map((log) => ({
      timestamp: Number(log.args.timestamp ?? 0n),
      price: Number(log.args.price ?? 0n) / ORACLE_PRICE_DECIMALS,
    }))
    .filter((point) => point.timestamp > 0)
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-PRICE_HISTORY_LIMIT);
};

const ORACLE_MANUAL_ABI = parseAbi([
  'function lastPriceManual(string methodology) view returns (bool)',
]);

/**
 * Whether the stored VERRA_VCS price came from the manual fallback reporter (`reportPrice`) rather
 * than the Chainlink Functions sources. Null when the oracle is not configured or does not expose
 * `lastPriceManual` (an older deployment): the dashboard then shows no source label.
 */
export const readPriceIsManual = async (
  client: PublicClient
): Promise<boolean | null> => {
  if (!isConfiguredAddress(CONTRACTS.carbonPriceOracle)) {
    return null;
  }
  try {
    return await client.readContract({
      address: CONTRACTS.carbonPriceOracle,
      abi: ORACLE_MANUAL_ABI,
      functionName: 'lastPriceManual',
      args: [ORACLE_METHODOLOGY],
    });
  } catch {
    return null;
  }
};
