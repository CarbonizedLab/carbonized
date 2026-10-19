import { type Abi, type PublicClient, parseAbi } from 'viem';
import { CONTRACTS } from '@/config/contracts';
import { getLogsClient } from '@/lib/logs-client';
import { readTokenDecimals, toDisplayNumber } from '@/lib/token-units';

export type ChainEventKind =
  | 'mint'
  | 'retire'
  | 'wrap'
  | 'unwrap'
  | 'order_created'
  | 'order_filled'
  | 'order_cancelled'
  | 'auction_created'
  | 'bid'
  | 'auction_finalized'
  | 'auction_cancelled';

/** One decoded onchain event, normalized for dashboards, audit logs and certificates. */
export interface ChainEvent {
  kind: ChainEventKind;
  /** Contract that emitted the event. */
  contract: `0x${string}`;
  blockNumber: bigint;
  logIndex: number;
  txHash: `0x${string}`;
  /** Unix seconds; filled by `attachTimestamps` / `fetchChainEvents`. */
  timestamp: number;
  /** Primary actor: recipient, retirer, wrapper, trader, taker, bidder, seller or winner. */
  actor?: `0x${string}`;
  /** NFT token id for mint/retire/wrap/unwrap. */
  tokenId?: bigint;
  /**
   * Decimal token ids for batch mint/wrap events that cover several credits.
   * Strings, not bigints: React dev's props diff JSON.stringifies primitive arrays and throws on bigint.
   */
  tokenIds?: string[];
  /** Order or auction id. */
  refId?: bigint;
  /** Tonnes CO2e (NFT/CCT events) or credit amount in tonnes (marketplace events, 18-dec normalized). */
  tonnes?: number;
  /** Payment-token (USDG) value per tonne or total, normalized with the token's own decimals; omitted when they could not be read. */
  usd?: number;
  /** Free text: mint methodology or retirement reason. */
  note?: string;
  isBuyOrder?: boolean;
}

const NFT_EVENTS = parseAbi([
  'event CreditMinted(uint256 indexed tokenId, string indexed projectId, address indexed recipient, uint256 co2Tonnes, string methodology)',
  'event CreditRetired(uint256 indexed tokenId, address indexed retiredBy, uint256 timestamp, uint256 co2Tonnes, string reason)',
  'event CreditBatchMinted(uint256[] tokenIds, string projectId, uint256 totalTonnes)',
]);

const TOKEN_EVENTS = parseAbi([
  'event CreditWrapped(address indexed user, uint256 indexed tokenId, uint256 co2Tonnes)',
  'event CreditUnwrapped(address indexed user, uint256 indexed tokenId, uint256 co2Tonnes)',
  'event BatchWrapped(address indexed user, uint256[] tokenIds, uint256 totalTonnes)',
]);

const MARKET_EVENTS = parseAbi([
  'event OrderCreated(uint256 indexed orderId, address indexed trader, bool isBuyOrder, uint256 amount, uint256 pricePerTonne)',
  'event OrderFilled(uint256 indexed orderId, address indexed taker, uint256 amountFilled, uint256 totalCost)',
  'event OrderCancelled(uint256 indexed orderId)',
  'event AuctionCreated(uint256 indexed auctionId, address indexed seller, uint256 amount, uint256 startPrice, uint256 endTime)',
  'event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 bidAmount)',
  'event AuctionFinalized(uint256 indexed auctionId, address indexed winner, uint256 winningBid)',
  'event AuctionCancelled(uint256 indexed auctionId)',
]);

const WAD = 1e18;
const DEFAULT_LOOKBACK_BLOCKS = 20_000n;
// Controlled mainnet began at block 91,682,262. Keep enough headroom to scan
// the complete protocol history rather than showing an alarming partial-data
// warning once the deployment is older than 100k blocks.
const MAX_SCAN_BLOCKS = 1_000_000n;
const INITIAL_CHUNK = 50_000n;
const MIN_CHUNK = 500n;
const TIMESTAMP_BATCH = 20;
const MAX_LOGS = 10_000;
const MAX_TIMESTAMP_LOOKUPS = 1000;

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const ZERO_ADDRESS_PATTERN = /^0x0{40}$/;
const DIGITS_PATTERN = /^\d+$/;

const isConfigured = (address: string): address is `0x${string}` =>
  ADDRESS_PATTERN.test(address) && !ZERO_ADDRESS_PATTERN.test(address);

/** First block to scan: `NEXT_PUBLIC_DEPLOY_BLOCK` if set, else the last 20k blocks. */
export const resolveFromBlock = (latest: bigint, override?: bigint): bigint => {
  if (override !== undefined) {
    return override;
  }
  const envBlock = process.env.NEXT_PUBLIC_DEPLOY_BLOCK;
  if (envBlock && DIGITS_PATTERN.test(envBlock)) {
    if (process.env.NODE_ENV === 'production' && envBlock === '0') {
      throw new Error('NEXT_PUBLIC_DEPLOY_BLOCK cannot be 0 in production');
    }
    return BigInt(envBlock);
  }
  return latest > DEFAULT_LOOKBACK_BLOCKS
    ? latest - DEFAULT_LOOKBACK_BLOCKS
    : 0n;
};

/**
 * True when scans start at `NEXT_PUBLIC_DEPLOY_BLOCK` (or genesis), i.e. the
 * event window should include the contracts' full history.
 */
export const scanCoversDeployment = (fromBlock: bigint): boolean =>
  fromBlock === 0n ||
  DIGITS_PATTERN.test(process.env.NEXT_PUBLIC_DEPLOY_BLOCK ?? '');

interface RawLog {
  eventName?: string;
  args?: Record<string, unknown>;
  blockNumber: bigint | null;
  logIndex: number | null;
  transactionHash: `0x${string}` | null;
}

interface LogBudget {
  remaining: number;
}

const getLogsChunked = async (
  client: PublicClient,
  address: `0x${string}`,
  abi: Abi,
  fromBlock: bigint,
  toBlock: bigint,
  budget: LogBudget
): Promise<RawLog[]> => {
  const logs: RawLog[] = [];
  let chunk = INITIAL_CHUNK;
  let start = fromBlock;
  while (start <= toBlock) {
    const end = start + chunk - 1n > toBlock ? toBlock : start + chunk - 1n;
    try {
      const part = await getLogsClient(client).getContractEvents({
        address,
        abi,
        fromBlock: start,
        toBlock: end,
      });
      if (part.length > budget.remaining) {
        throw new Error(`Historical log limit of ${MAX_LOGS} exceeded`);
      }
      budget.remaining -= part.length;
      logs.push(...(part as unknown as RawLog[]));
      start = end + 1n;
    } catch (error) {
      if (chunk <= MIN_CHUNK) {
        throw error;
      }
      chunk /= 2n;
    }
  }
  return logs;
};

const asAddress = (value: unknown): `0x${string}` | undefined =>
  typeof value === 'string' ? (value as `0x${string}`) : undefined;

const asBig = (value: unknown): bigint | undefined =>
  typeof value === 'bigint' ? value : undefined;

const asIdList = (value: unknown): string[] | undefined =>
  Array.isArray(value)
    ? value
        .filter((v): v is bigint => typeof v === 'bigint')
        .map((v) => v.toString())
    : undefined;

const wad = (value: unknown): number | undefined => {
  const big = asBig(value);
  return big === undefined ? undefined : Number(big) / WAD;
};

/** Payment-token amount in whole tokens; undefined when decimals are unknown. */
const pay = (value: unknown, decimals: number | undefined) => {
  const big = asBig(value);
  return big === undefined || decimals === undefined
    ? undefined
    : toDisplayNumber(big, decimals);
};

const decode = (
  contract: `0x${string}`,
  log: RawLog,
  paymentDecimals: number | undefined
): ChainEvent | undefined => {
  if (log.blockNumber === null || log.transactionHash === null) {
    return;
  }
  const a = log.args ?? {};
  const base = {
    contract,
    blockNumber: log.blockNumber,
    logIndex: log.logIndex ?? 0,
    txHash: log.transactionHash,
    timestamp: 0,
  };
  switch (log.eventName) {
    case 'CreditMinted':
      return {
        ...base,
        kind: 'mint',
        actor: asAddress(a.recipient),
        tokenId: asBig(a.tokenId),
        tonnes: wad(a.co2Tonnes) ?? 0,
        note: typeof a.methodology === 'string' ? a.methodology : undefined,
      };
    case 'CreditBatchMinted':
      return {
        ...base,
        kind: 'mint',
        tokenIds: asIdList(a.tokenIds),
        tonnes: wad(a.totalTonnes) ?? 0,
        note: typeof a.projectId === 'string' ? a.projectId : undefined,
      };
    case 'CreditRetired':
      return {
        ...base,
        kind: 'retire',
        actor: asAddress(a.retiredBy),
        tokenId: asBig(a.tokenId),
        tonnes: wad(a.co2Tonnes) ?? 0,
        note: typeof a.reason === 'string' ? a.reason : undefined,
      };
    case 'CreditWrapped':
    case 'CreditUnwrapped':
      return {
        ...base,
        kind: log.eventName === 'CreditWrapped' ? 'wrap' : 'unwrap',
        actor: asAddress(a.user),
        tokenId: asBig(a.tokenId),
        tonnes: wad(a.co2Tonnes) ?? 0,
      };
    case 'BatchWrapped':
      return {
        ...base,
        kind: 'wrap',
        actor: asAddress(a.user),
        tokenIds: asIdList(a.tokenIds),
        tonnes: wad(a.totalTonnes) ?? 0,
      };
    case 'OrderCreated':
      return {
        ...base,
        kind: 'order_created',
        actor: asAddress(a.trader),
        refId: asBig(a.orderId),
        tonnes: wad(a.amount),
        usd: pay(a.pricePerTonne, paymentDecimals),
        isBuyOrder: a.isBuyOrder === true,
      };
    case 'OrderFilled':
      return {
        ...base,
        kind: 'order_filled',
        actor: asAddress(a.taker),
        refId: asBig(a.orderId),
        tonnes: wad(a.amountFilled),
        usd: pay(a.totalCost, paymentDecimals),
      };
    case 'OrderCancelled':
      return { ...base, kind: 'order_cancelled', refId: asBig(a.orderId) };
    case 'AuctionCreated':
      return {
        ...base,
        kind: 'auction_created',
        actor: asAddress(a.seller),
        refId: asBig(a.auctionId),
        tonnes: wad(a.amount),
        usd: pay(a.startPrice, paymentDecimals),
      };
    case 'BidPlaced':
      return {
        ...base,
        kind: 'bid',
        actor: asAddress(a.bidder),
        refId: asBig(a.auctionId),
        usd: pay(a.bidAmount, paymentDecimals),
      };
    case 'AuctionFinalized':
      return {
        ...base,
        kind: 'auction_finalized',
        actor: asAddress(a.winner),
        refId: asBig(a.auctionId),
        usd: pay(a.winningBid, paymentDecimals),
      };
    case 'AuctionCancelled':
      return { ...base, kind: 'auction_cancelled', refId: asBig(a.auctionId) };
    default:
      return;
  }
};

/** Fills `timestamp` for every event by reading each distinct block once. */
export const attachTimestamps = async (
  client: PublicClient,
  events: ChainEvent[]
): Promise<void> => {
  const blocks = [...new Set(events.map((e) => e.blockNumber))].slice(
    0,
    MAX_TIMESTAMP_LOOKUPS
  );
  const stamps = new Map<bigint, number>();
  for (let i = 0; i < blocks.length; i += TIMESTAMP_BATCH) {
    const batch = blocks.slice(i, i + TIMESTAMP_BATCH);
    const results = await Promise.all(
      batch.map((blockNumber) => client.getBlock({ blockNumber }))
    );
    for (const block of results) {
      stamps.set(block.number, Number(block.timestamp));
    }
  }
  for (const event of events) {
    event.timestamp = stamps.get(event.blockNumber) ?? 0;
  }
};

export interface FetchChainEventsOptions {
  fromBlock?: bigint;
  /** Last block to scan (defaults to the chain head). */
  toBlock?: bigint;
  /** Keep only events whose actor equals this address (case-insensitive). */
  account?: string;
  kinds?: ChainEventKind[];
  withTimestamps?: boolean;
}

/**
 * Reads NFT, token and marketplace events, newest first.
 * Unconfigured contract addresses are skipped. Never throws for a single
 * failing contract; failures are returned in `errors`.
 */
export const fetchChainEvents = async (
  client: PublicClient,
  options: FetchChainEventsOptions = {}
): Promise<{ events: ChainEvent[]; errors: string[] }> => {
  const latest = options.toBlock ?? (await client.getBlockNumber());
  const requestedFromBlock = resolveFromBlock(latest, options.fromBlock);
  const earliestAllowedBlock =
    latest >= MAX_SCAN_BLOCKS ? latest - MAX_SCAN_BLOCKS + 1n : 0n;
  const fromBlock =
    requestedFromBlock < earliestAllowedBlock
      ? earliestAllowedBlock
      : requestedFromBlock;
  const sources: [string, string, Abi][] = [
    ['CarbonCreditNFT', CONTRACTS.carbonCreditNFT, NFT_EVENTS],
    ['CarbonCreditToken', CONTRACTS.carbonCreditToken, TOKEN_EVENTS],
    ['CarbonMarketplace', CONTRACTS.carbonMarketplace, MARKET_EVENTS],
  ];

  const events: ChainEvent[] = [];
  const errors: string[] = [];
  if (fromBlock !== requestedFromBlock) {
    errors.push(
      `Historical scan capped at ${MAX_SCAN_BLOCKS.toString()} blocks; older events were omitted`
    );
  }
  const logBudget: LogBudget = { remaining: MAX_LOGS };
  let paymentDecimals: number | undefined;
  if (isConfigured(CONTRACTS.usdc)) {
    try {
      paymentDecimals = await readTokenDecimals(client, CONTRACTS.usdc);
    } catch {
      errors.push('USDG: could not read token decimals; USD values omitted');
    }
  }
  await Promise.all(
    sources.map(async ([name, address, abi]) => {
      if (!isConfigured(address)) {
        return;
      }
      try {
        const logs = await getLogsChunked(
          client,
          address,
          abi,
          fromBlock,
          latest,
          logBudget
        );
        for (const log of logs) {
          const decoded = decode(address, log, paymentDecimals);
          if (decoded) {
            events.push(decoded);
          }
        }
      } catch (error) {
        errors.push(
          `${name}: ${error instanceof Error ? error.message : 'getLogs failed'}`
        );
      }
    })
  );

  const account = options.account?.toLowerCase();
  const filtered = events.filter(
    (e) =>
      (!options.kinds || options.kinds.includes(e.kind)) &&
      (!account || e.actor?.toLowerCase() === account)
  );
  filtered.sort((a, b) =>
    a.blockNumber === b.blockNumber
      ? b.logIndex - a.logIndex
      : Number(b.blockNumber - a.blockNumber)
  );
  if (options.withTimestamps !== false) {
    await attachTimestamps(client, filtered);
  }
  return { events: filtered, errors };
};
