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
export const getLogsChunked = async <logsReturn>(
  client: PublicClient,
  params: { fromBlock: bigint; toBlock: bigint } & Record<string, unknown>
): Promise<logsReturn[]> => {
  const { fromBlock, toBlock, ...rest } = params;
  const getLogs = client.getLogs as unknown as (
    request: typeof params
  ) => Promise<logsReturn[]>;
  const logs: logsReturn[] = [];
  let start = fromBlock;
  while (start <= toBlock) {
    let end =
      start + MAX_LOG_RANGE - 1n > toBlock
        ? toBlock
        : start + MAX_LOG_RANGE - 1n;
    let part: logsReturn[] | undefined;
    while (part === undefined) {
      try {
        part = await getLogs({
          ...rest,
          fromBlock: start,
          toBlock: end,
        });
      } catch (error) {
        if (end <= start) {
          throw error;
        }
        end = start + (end - start) / 2n;
      }
    }
    logs.push(...part);
    start = end + 1n;
  }
  return logs;
};
