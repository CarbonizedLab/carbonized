import { createPublicClient, http, type PublicClient } from 'viem';
import { targetChain } from '@/config/wagmi';
import {
  ROBINHOOD_MAINNET_CHAIN_ID,
  ROBINHOOD_TESTNET_CHAIN_ID,
} from '@/lib/network';

/**
 * Some RPC plans (e.g. Alchemy's free tier) cap `eth_getLogs` at a handful of
 * blocks, which breaks history scans. Log queries therefore go through a
 * separate endpoint. Set `NEXT_PUBLIC_LOGS_RPC_URL` to override it.
 */
// PublicNode's Robinhood endpoint rejects historical `eth_getLogs` without a
// personal token. The official endpoint accepts the protocol's deployment-era
// log ranges, so it is the reliable public default for the live dashboard.
const ROBINHOOD_MAINNET_LOGS_RPC = 'https://rpc.mainnet.chain.robinhood.com';
const ROBINHOOD_TESTNET_LOGS_RPC =
  'https://robinhood-sepolia-rpc.publicnode.com';

const defaultLogsRpc = (chainId: number): string | undefined => {
  if (chainId === ROBINHOOD_MAINNET_CHAIN_ID) {
    return ROBINHOOD_MAINNET_LOGS_RPC;
  }
  if (chainId === ROBINHOOD_TESTNET_CHAIN_ID) {
    return ROBINHOOD_TESTNET_LOGS_RPC;
  }
  return;
};

const logsRpcUrl =
  process.env.NEXT_PUBLIC_LOGS_RPC_URL || defaultLogsRpc(targetChain.id);

let cached: PublicClient | undefined;

/** Returns a client for log scans, or `fallback` when no separate endpoint is configured. */
export const getLogsClient = (fallback: PublicClient): PublicClient => {
  if (!logsRpcUrl) {
    return fallback;
  }
  cached ??= createPublicClient({
    chain: targetChain,
    transport: http(logsRpcUrl),
  }) as PublicClient;
  return cached;
};

const MAX_LOG_RANGE = 9_000n;

/**
 * `getLogs` split into <= 9,000-block windows (inclusive), halving further on a
 * range-limit error from the RPC. Some providers (e.g. blockmachine.io) cap
 * `eth_getLogs` at 10,000 blocks; a single wide query throws
 * "block range exceeds maximum allowed" instead of paging automatically.
 */

const LOG_CONCURRENCY = 6;
// Full windows lie entirely in the past, so their logs never change. Caching
// them makes page-to-page navigation skip the history re-scan.
const windowCache = new Map<string, unknown[]>();
const bigintReplacer = (_key: string, value: unknown) =>
  typeof value === 'bigint' ? value.toString() : value;

export const getLogsChunked = async <logsReturn>(
  client: PublicClient,
  params: { fromBlock: bigint; toBlock: bigint } & Record<string, unknown>
): Promise<logsReturn[]> => {
  const { fromBlock, toBlock, ...rest } = params;
  const getLogs = client.getLogs as unknown as (
    request: typeof params
  ) => Promise<logsReturn[]>;
  const filterKey = JSON.stringify(rest, bigintReplacer);

  const fetchWindow = async (
    start: bigint,
    last: bigint
  ): Promise<logsReturn[]> => {
    const full = last - start + 1n === MAX_LOG_RANGE;
    const key = `${filterKey}|${start}`;
    const hit = full ? windowCache.get(key) : undefined;
    if (hit) {
      return hit as logsReturn[];
    }
    const out: logsReturn[] = [];
    let from = start;
    while (from <= last) {
      let end = last;
      let part: logsReturn[] | undefined;
      while (part === undefined) {
        try {
          part = await getLogs({ ...rest, fromBlock: from, toBlock: end });
        } catch (error) {
          if (end <= from) {
            throw error;
          }
          end = from + (end - from) / 2n;
        }
      }
      out.push(...part);
      from = end + 1n;
    }
    if (full) {
      windowCache.set(key, out);
    }
    return out;
  };

  const windows: Array<[bigint, bigint]> = [];
  for (let start = fromBlock; start <= toBlock; start += MAX_LOG_RANGE) {
    const last = start + MAX_LOG_RANGE - 1n;
    windows.push([start, last > toBlock ? toBlock : last]);
  }
  const logs: logsReturn[] = [];
  for (let i = 0; i < windows.length; i += LOG_CONCURRENCY) {
    const batch = await Promise.all(
      windows
        .slice(i, i + LOG_CONCURRENCY)
        .map(([start, last]) => fetchWindow(start, last))
    );
    for (const part of batch) {
      logs.push(...part);
    }
  }
  return logs;
};
