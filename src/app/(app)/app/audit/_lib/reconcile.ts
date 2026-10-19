import { type Address, type PublicClient, parseAbi } from 'viem';
import { CONTRACTS } from '@/config/contracts';
import type { ChainEvent } from '@/lib/onchain-events';
import {
  orderCostFloor,
  readTokenDecimals,
  toDisplayNumber,
} from '@/lib/token-units';

const WAD = 1e18;
const TOLERANCE = 1e-6;
/** Max orders/auctions read per kind; older ones are skipped (and flagged). */
const MAX_SCAN = 400;
const READ_BATCH = 25;

const NFT_ABI = parseAbi([
  'function totalMintedTonnes() view returns (uint256)',
  'function totalRetiredTonnes() view returns (uint256)',
  'function totalActiveCredits() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
]);

const TOKEN_ABI = parseAbi([
  'function symbol() view returns (string)',
  'function totalSupply() view returns (uint256)',
  'function totalTonnesWrapped() view returns (uint256)',
  'function totalNFTsWrapped() view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
]);

const MARKET_ABI = parseAbi([
  'function carbonToken() view returns (address)',
  'function paymentToken() view returns (address)',
  'function nextOrderId() view returns (uint256)',
  'function nextAuctionId() view returns (uint256)',
  'function orders(uint256 id) view returns (uint256 orderId, address trader, bool isBuyOrder, uint256 amount, uint256 pricePerTonne, uint256 filled, bool isActive, uint256 createdAt, uint256 expiresAt, bool requiresKYC)',
  'function auctions(uint256 id) view returns (uint256 auctionId, address seller, uint256 amount, uint256 startPrice, uint256 highestBid, address highestBidder, uint256 startTime, uint256 endTime, bool isActive)',
  'function ammPool() view returns (uint256 carbonReserve, uint256 stableReserve, uint256 totalLPTokens, uint256 lastPrice, uint256 lastUpdate)',
]);

const ERC20_ABI = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
]);

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const ZERO_PATTERN = /^0x0{40}$/;

export const isConfiguredAddress = (value: string): value is Address =>
  ADDRESS_PATTERN.test(value) && !ZERO_PATTERN.test(value);

export type CheckGroup = 'nft' | 'token' | 'market';
export type CheckUnit = 'tonnes' | 'count' | 'usdc';

export interface ReconCheck {
  /** Translation key suffix: `check.<id>`. */
  id: string;
  group: CheckGroup;
  /** Optional subject (e.g. token symbol) substituted into the label. */
  subject?: string;
  expected: number;
  actual: number;
  /** `actual - expected`. */
  delta: number;
  unit: CheckUnit;
  /** `at-least` passes when `actual >= expected` (surplus = accrued fees). */
  rule: 'equal' | 'at-least';
  /** True when the result depends on the scanned event window being complete. */
  windowDependent: boolean;
  passed: boolean;
}

interface TokenSnapshot {
  address: Address;
  symbol: string;
  totalSupply: number;
  totalTonnesWrapped: number;
  nftsWrapped: number;
  nftsHeld: number;
}

interface MarketSnapshot {
  carbonToken: Address;
  paymentToken: Address;
  carbonBalance: number;
  paymentBalance: number;
  orderCount: number;
  auctionCount: number;
  /** Escrow derived from active orders, active auctions and the AMM pool. */
  carbonEscrow: number;
  paymentEscrow: number;
  /** True when more than `MAX_SCAN` orders/auctions exist and the oldest were skipped. */
  partial: boolean;
}

interface NftSnapshot {
  totalMinted: number;
  totalRetired: number;
  activeCredits: number;
}

export interface ChainSnapshot {
  nft: NftSnapshot | null;
  tokens: TokenSnapshot[];
  market: MarketSnapshot | null;
  /** Read failures, keyed by contract name. */
  errors: string[];
}

const toNumber = (value: bigint): number => Number(value) / WAD;

const messageOf = (error: unknown): string =>
  error instanceof Error
    ? (error.message.split('\n')[0] ?? 'read failed')
    : 'read failed';

const readNft = async (
  client: PublicClient,
  blockNumber: bigint
): Promise<NftSnapshot> => {
  const address = CONTRACTS.carbonCreditNFT;
  const [totalMinted, totalRetired, activeCredits] = await Promise.all([
    client.readContract({
      address,
      abi: NFT_ABI,
      functionName: 'totalMintedTonnes',
      blockNumber,
    }),
    client.readContract({
      address,
      abi: NFT_ABI,
      functionName: 'totalRetiredTonnes',
      blockNumber,
    }),
    client.readContract({
      address,
      abi: NFT_ABI,
      functionName: 'totalActiveCredits',
      blockNumber,
    }),
  ]);
  return {
    totalMinted: toNumber(totalMinted),
    totalRetired: toNumber(totalRetired),
    activeCredits: Number(activeCredits),
  };
};

const readToken = async (
  client: PublicClient,
  address: Address,
  blockNumber: bigint
): Promise<TokenSnapshot> => {
  const [symbol, supply, wrapped, nftsWrapped, nftsHeld] = await Promise.all([
    client.readContract({
      address,
      abi: TOKEN_ABI,
      functionName: 'symbol',
      blockNumber,
    }),
    client.readContract({
      address,
      abi: TOKEN_ABI,
      functionName: 'totalSupply',
      blockNumber,
    }),
    client.readContract({
      address,
      abi: TOKEN_ABI,
      functionName: 'totalTonnesWrapped',
      blockNumber,
    }),
    client.readContract({
      address,
      abi: TOKEN_ABI,
      functionName: 'totalNFTsWrapped',
      blockNumber,
    }),
    client.readContract({
      address: CONTRACTS.carbonCreditNFT,
      abi: NFT_ABI,
      functionName: 'balanceOf',
      args: [address],
      blockNumber,
    }),
  ]);
  return {
    address,
    symbol,
    totalSupply: toNumber(supply),
    totalTonnesWrapped: toNumber(wrapped),
    nftsWrapped: Number(nftsWrapped),
    nftsHeld: Number(nftsHeld),
  };
};

/** Ids of the newest `MAX_SCAN` records out of `[1, next)`. */
const idWindow = (next: bigint): { ids: bigint[]; partial: boolean } => {
  const last = Number(next) - 1;
  const first = Math.max(1, last - MAX_SCAN + 1);
  const ids: bigint[] = [];
  for (let id = first; id <= last; id++) {
    ids.push(BigInt(id));
  }
  return { ids, partial: first > 1 };
};

const inBatches = async <T, R>(
  items: T[],
  run: (item: T) => Promise<R>
): Promise<R[]> => {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += READ_BATCH) {
    out.push(...(await Promise.all(items.slice(i, i + READ_BATCH).map(run))));
  }
  return out;
};

const readMarket = async (
  client: PublicClient,
  blockNumber: bigint
): Promise<MarketSnapshot> => {
  const address = CONTRACTS.carbonMarketplace;
  const read = <
    F extends
      | 'carbonToken'
      | 'paymentToken'
      | 'nextOrderId'
      | 'nextAuctionId'
      | 'ammPool',
  >(
    functionName: F
  ) =>
    client.readContract({
      address,
      abi: MARKET_ABI,
      functionName,
      blockNumber,
    });
  const [carbonToken, paymentToken, nextOrder, nextAuction, pool] =
    await Promise.all([
      read('carbonToken'),
      read('paymentToken'),
      read('nextOrderId'),
      read('nextAuctionId'),
      read('ammPool'),
    ]);

  const orderWindow = idWindow(nextOrder);
  const auctionWindow = idWindow(nextAuction);
  const [orders, auctions, carbonBalance, paymentBalance] = await Promise.all([
    inBatches(orderWindow.ids, (id) =>
      client.readContract({
        address,
        abi: MARKET_ABI,
        functionName: 'orders',
        args: [id],
        blockNumber,
      })
    ),
    inBatches(auctionWindow.ids, (id) =>
      client.readContract({
        address,
        abi: MARKET_ABI,
        functionName: 'auctions',
        args: [id],
        blockNumber,
      })
    ),
    client.readContract({
      address: carbonToken,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address],
      blockNumber,
    }),
    client.readContract({
      address: paymentToken,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [address],
      blockNumber,
    }),
  ]);

  // CCT is 18 decimals; the payment token (USDG) decimals are read from the token.
  const paymentDecimals = await readTokenDecimals(client, paymentToken);
  let carbonEscrowWei = pool[0];
  let paymentEscrowWei = pool[1];
  for (const [, , isBuy, amount, price, filled, isActive] of orders) {
    if (!isActive) {
      continue;
    }
    const unfilled = amount - filled;
    if (isBuy) {
      paymentEscrowWei += orderCostFloor(unfilled, price);
    } else {
      carbonEscrowWei += unfilled;
    }
  }
  for (const [, , amount, , highestBid, , , , isActive] of auctions) {
    if (isActive) {
      carbonEscrowWei += amount;
      paymentEscrowWei += highestBid;
    }
  }

  return {
    carbonToken,
    paymentToken,
    carbonBalance: toNumber(carbonBalance),
    paymentBalance: toDisplayNumber(paymentBalance, paymentDecimals),
    orderCount: Number(nextOrder) - 1,
    auctionCount: Number(nextAuction) - 1,
    carbonEscrow: toNumber(carbonEscrowWei),
    paymentEscrow: toDisplayNumber(paymentEscrowWei, paymentDecimals),
    partial: orderWindow.partial || auctionWindow.partial,
  };
};

/** Reads every onchain counter the reconciliation needs at `blockNumber`; never throws. */
export const readChainSnapshot = async (
  client: PublicClient,
  blockNumber: bigint
): Promise<ChainSnapshot> => {
  const errors: string[] = [];
  const guard = async <T>(name: string, run: () => Promise<T>) => {
    try {
      return await run();
    } catch (error) {
      errors.push(`${name}: ${messageOf(error)}`);
      return null;
    }
  };

  const nft = isConfiguredAddress(CONTRACTS.carbonCreditNFT)
    ? await guard('CarbonCreditNFT', () => readNft(client, blockNumber))
    : null;
  const tokenAddress = CONTRACTS.carbonCreditToken;
  const token = isConfiguredAddress(tokenAddress)
    ? await guard('CarbonCreditToken', () =>
        readToken(client, tokenAddress, blockNumber)
      )
    : null;
  const market = isConfiguredAddress(CONTRACTS.carbonMarketplace)
    ? await guard('CarbonMarketplace', () => readMarket(client, blockNumber))
    : null;

  return { nft, tokens: token ? [token] : [], market, errors };
};

const makeCheck = (
  base: Pick<ReconCheck, 'id' | 'group' | 'unit' | 'windowDependent'> & {
    subject?: string;
    rule?: ReconCheck['rule'];
  },
  expected: number,
  actual: number
): ReconCheck => {
  const rule = base.rule ?? 'equal';
  const delta = actual - expected;
  const tolerance = base.unit === 'count' ? 0 : TOLERANCE;
  const passed =
    rule === 'equal' ? Math.abs(delta) <= tolerance : delta >= -tolerance;
  return { ...base, rule, expected, actual, delta, passed };
};

interface EventTotals {
  minted: number;
  mintedCount: number;
  retired: number;
  retiredCount: number;
  orders: number;
  auctions: number;
}

const touched = (event: ChainEvent): number => event.tokenIds?.length ?? 1;

const sumNftEvents = (events: ChainEvent[]): EventTotals => {
  const totals: EventTotals = {
    minted: 0,
    mintedCount: 0,
    retired: 0,
    retiredCount: 0,
    orders: 0,
    auctions: 0,
  };
  for (const event of events) {
    if (event.kind === 'mint') {
      totals.minted += event.tonnes ?? 0;
      totals.mintedCount += touched(event);
    } else if (event.kind === 'retire') {
      totals.retired += event.tonnes ?? 0;
      totals.retiredCount += 1;
    } else if (event.kind === 'order_created') {
      totals.orders += 1;
    } else if (event.kind === 'auction_created') {
      totals.auctions += 1;
    }
  }
  return totals;
};

const nftChecks = (totals: EventTotals, nft: NftSnapshot): ReconCheck[] => {
  const common = {
    group: 'nft',
    unit: 'tonnes',
    windowDependent: true,
  } as const;
  return [
    makeCheck({ ...common, id: 'nftMinted' }, totals.minted, nft.totalMinted),
    makeCheck(
      { ...common, id: 'nftRetired' },
      totals.retired,
      nft.totalRetired
    ),
    makeCheck(
      { ...common, id: 'nftNet' },
      totals.minted - totals.retired,
      nft.totalMinted - nft.totalRetired
    ),
    makeCheck(
      { ...common, id: 'nftActive', unit: 'count' },
      totals.mintedCount - totals.retiredCount,
      nft.activeCredits
    ),
  ];
};

const tokenChecks = (
  events: ChainEvent[],
  token: TokenSnapshot
): ReconCheck[] => {
  let net = 0;
  let netCount = 0;
  for (const event of events) {
    if (event.contract.toLowerCase() !== token.address.toLowerCase()) {
      continue;
    }
    if (event.kind === 'wrap') {
      net += event.tonnes ?? 0;
      netCount += touched(event);
    } else if (event.kind === 'unwrap') {
      net -= event.tonnes ?? 0;
      netCount -= 1;
    }
  }
  const subject = token.symbol;
  return [
    makeCheck(
      {
        id: 'tokenSupply',
        group: 'token',
        unit: 'tonnes',
        windowDependent: true,
        subject,
      },
      net,
      token.totalSupply
    ),
    makeCheck(
      {
        id: 'tokenWrappedCount',
        group: 'token',
        unit: 'count',
        windowDependent: true,
        subject,
      },
      netCount,
      token.nftsWrapped
    ),
    makeCheck(
      {
        id: 'tokenBacking',
        group: 'token',
        unit: 'tonnes',
        windowDependent: false,
        subject,
      },
      token.totalTonnesWrapped,
      token.totalSupply
    ),
    makeCheck(
      {
        id: 'tokenLocked',
        group: 'token',
        unit: 'count',
        windowDependent: false,
        subject,
      },
      token.nftsWrapped,
      token.nftsHeld
    ),
  ];
};

const marketChecks = (
  totals: EventTotals,
  market: MarketSnapshot
): ReconCheck[] => [
  makeCheck(
    {
      id: 'marketCarbon',
      group: 'market',
      unit: 'tonnes',
      windowDependent: false,
    },
    market.carbonEscrow,
    market.carbonBalance
  ),
  makeCheck(
    {
      id: 'marketPayment',
      group: 'market',
      unit: 'usdc',
      windowDependent: false,
      rule: 'at-least',
    },
    market.paymentEscrow,
    market.paymentBalance
  ),
  makeCheck(
    {
      id: 'marketOrders',
      group: 'market',
      unit: 'count',
      windowDependent: true,
    },
    totals.orders,
    market.orderCount
  ),
  makeCheck(
    {
      id: 'marketAuctions',
      group: 'market',
      unit: 'count',
      windowDependent: true,
    },
    totals.auctions,
    market.auctionCount
  ),
];

/** Three-way reconciliation: event log vs NFT totals, CCT supply and marketplace escrow. */
export const buildChecks = (
  events: ChainEvent[],
  snapshot: ChainSnapshot
): ReconCheck[] => {
  const totals = sumNftEvents(events);
  return [
    ...(snapshot.nft ? nftChecks(totals, snapshot.nft) : []),
    ...snapshot.tokens.flatMap((token) => tokenChecks(events, token)),
    ...(snapshot.market ? marketChecks(totals, snapshot.market) : []),
  ];
};
