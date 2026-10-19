'use client';

import { Plus, RefreshCw, Search, Wallet } from 'lucide-react';
import Link from 'next/link';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { parseAbiItem } from 'viem';
import { useAccount, usePublicClient } from 'wagmi';
import { EmptyState } from '@/components/app/empty-state';
import { PendingClaimBanner } from '@/components/app/pending-claim-banner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { CONTRACTS } from '@/config/contracts';
import { useContractInteraction } from '@/hooks/use-contract-interaction';
import { formatCurrency } from '@/lib/carb-format';
import { type TranslateFn, useT } from '@/lib/i18n';
import { getLogsChunked, getLogsClient } from '@/lib/logs-client';
import { getMarketplaceRevert } from '@/lib/marketplace-errors';
import { parseAmountInput, toDisplayNumber } from '@/lib/token-units';
import { AuctionCard } from './_components/auction-card';
import {
  AUCTION_FILTERS,
  type AuctionFilter,
  type AuctionItem,
  type AuctionUserRole,
  type BidHistoryEntry,
  getErrorMessage,
  getUserRole,
  USER_REJECTION_PATTERN,
} from './_components/auction-utils';
import { BidDialog } from './_components/bid-dialog';
import { messages } from './_messages';

const bidPlacedEvent = parseAbiItem(
  'event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 bidAmount)'
);

const HISTORY_BLOCK_WINDOW = 20_000n;
const MILLIS_PER_SECOND = 1000;
const SECONDS_PER_HOUR = 3600;
const HOURS_PER_DAY = 24;

const getNowSeconds = (): number => Math.floor(Date.now() / MILLIS_PER_SECOND);

const getBidValidationError = (
  auction: AuctionItem,
  bidWei: bigint,
  t: TranslateFn
): string | null => {
  if (auction.currentBidWei > 0n && bidWei <= auction.currentBidWei) {
    return t('validation.higherThanCurrent', {
      amount: formatCurrency(auction.currentBid),
    });
  }
  if (bidWei < auction.startingPriceWei) {
    return t('validation.atLeastStarting', {
      amount: formatCurrency(auction.startingPrice),
    });
  }
  return null;
};

const showBidError = (error: unknown, t: TranslateFn) => {
  if (getMarketplaceRevert(error) === 'sellerCannotBid') {
    toast.error(t('error.sellerCannotBid'));
    return;
  }
  const message = getErrorMessage(error, t('error.bidFailed'));
  if (USER_REJECTION_PATTERN.test(message.toLowerCase())) {
    toast.error(t('toast.walletCancelled'));
  } else {
    toast.error(message);
  }
};

const matchesAuctionFilter = (
  filter: AuctionFilter,
  auction: AuctionItem,
  now: number,
  role: AuctionUserRole
): boolean => {
  const hoursUntilEnd = (auction.endTime - now) / SECONDS_PER_HOUR;
  const isLive = auction.status === 'active' && hoursUntilEnd > 0;

  switch (filter) {
    case 'active':
      return isLive;
    case 'ending-soon':
      return isLive && hoursUntilEnd < HOURS_PER_DAY;
    case 'my-bids':
      return role === 'highest-bidder' || role === 'outbid';
    case 'my-auctions':
      return role === 'seller';
    default:
      return true;
  }
};

const getEmptyDescription = (filter: AuctionFilter, t: TranslateFn): string => {
  if (filter === 'my-bids') {
    return t('empty.myBids');
  }
  if (filter === 'my-auctions') {
    return t('empty.myAuctions');
  }
  return t('empty.default');
};

const AuctionsPage = () => {
  const t = useT(messages);
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const {
    getActiveAuctions,
    placeBid,
    finalizeAuction,
    cancelAuction,
    ensureErc20Allowance,
    getPaymentDecimals,
  } = useContractInteraction();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<AuctionFilter>('all');
  const [selectedAuction, setSelectedAuction] = useState<AuctionItem | null>(
    null
  );
  const [bidAmount, setBidAmount] = useState('');
  const [auctions, setAuctions] = useState<AuctionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bidHistory, setBidHistory] = useState<
    Record<string, BidHistoryEntry[]>
  >({});
  const [showBidHistoryFor, setShowBidHistoryFor] = useState<string | null>(
    null
  );
  const [finalizingId, setFinalizingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [now, setNow] = useState(getNowSeconds);
  const requestedHistory = useRef(new Set<string>());
  // Latest translator for callbacks that must keep a stable identity.
  const tRef = useRef(t);
  tRef.current = t;

  // Tick once per second so countdowns stay live.
  useEffect(() => {
    const interval = setInterval(
      () => setNow(getNowSeconds()),
      MILLIS_PER_SECOND
    );
    return () => clearInterval(interval);
  }, []);

  // ── Fetch auctions ─────────────────────────────────
  const fetchAuctions = useCallback(async () => {
    if (!(isConnected && address)) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const data = await getActiveAuctions();
      const mapped = (data || []).map(
        (auction): AuctionItem => ({
          id: auction.auctionId.toString(),
          seller: auction.seller,
          quantity: auction.amount,
          startingPrice: auction.startPrice,
          currentBid: auction.highestBid,
          startingPriceWei: auction.startPriceWei,
          currentBidWei: auction.highestBidWei,
          paymentDecimals: auction.paymentDecimals,
          highestBidder: auction.highestBidder,
          startTime: auction.startTime,
          endTime: auction.endTime,
          status: auction.isActive ? 'active' : 'ended',
        })
      );
      // Allow bid history to be re-read for the refreshed list.
      requestedHistory.current.clear();
      setAuctions(mapped);
    } catch {
      toast.error(tRef.current('toast.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [isConnected, address, getActiveAuctions]);

  useEffect(() => {
    fetchAuctions();
  }, [fetchAuctions]);

  // ── Fetch bid history for a specific auction ───────
  const fetchBidHistory = useCallback(
    async (auctionId: string) => {
      if (!publicClient) {
        return;
      }
      try {
        const paymentDecimals = await getPaymentDecimals();
        const latestBlock = await publicClient.getBlockNumber();
        const fromBlock =
          latestBlock > HISTORY_BLOCK_WINDOW
            ? latestBlock - HISTORY_BLOCK_WINDOW
            : 0n;

        const logs = await getLogsChunked<{
          transactionHash: string;
          logIndex: number;
          blockNumber: bigint;
          args: { bidder?: string; bidAmount?: bigint };
        }>(getLogsClient(publicClient), {
          address: CONTRACTS.carbonMarketplace as `0x${string}`,
          event: bidPlacedEvent,
          args: { auctionId: BigInt(auctionId) },
          fromBlock,
          toBlock: latestBlock,
        });

        const entries: BidHistoryEntry[] = logs.map((log) => ({
          id: `${log.transactionHash}-${log.logIndex}`,
          bidder: log.args.bidder ?? '',
          amount: toDisplayNumber(log.args.bidAmount ?? 0n, paymentDecimals),
          blockNumber: log.blockNumber,
        }));

        // Most recent first
        entries.sort((a, b) => Number(b.blockNumber - a.blockNumber));

        setBidHistory((prev) => ({ ...prev, [auctionId]: entries }));
      } catch {
        requestedHistory.current.delete(auctionId);
      }
    },
    [publicClient, getPaymentDecimals]
  );

  // Eagerly load bid history for all auctions to detect outbid status.
  useEffect(() => {
    if (!address || auctions.length === 0) {
      return;
    }
    for (const auction of auctions) {
      if (requestedHistory.current.has(auction.id)) {
        continue;
      }
      requestedHistory.current.add(auction.id);
      fetchBidHistory(auction.id);
    }
  }, [address, auctions, fetchBidHistory]);

  // ── Filters ────────────────────────────────────────
  const normalizedSearch = searchTerm.toLowerCase();
  const filteredAuctions = auctions.filter((auction) => {
    const matchesSearch =
      auction.id.toLowerCase().includes(normalizedSearch) ||
      auction.seller.toLowerCase().includes(normalizedSearch);
    if (!matchesSearch) {
      return false;
    }

    const role = getUserRole(auction, address, bidHistory[auction.id]);
    return matchesAuctionFilter(filterStatus, auction, now, role);
  });

  const closeBidDialog = () => {
    setSelectedAuction(null);
    setBidAmount('');
  };

  const openBidDialog = (auction: AuctionItem) => {
    setSelectedAuction(auction);
    setBidAmount('');
  };

  const toggleBidHistory = (auctionId: string) => {
    setShowBidHistoryFor(showBidHistoryFor === auctionId ? null : auctionId);
    if (!bidHistory[auctionId]) {
      fetchBidHistory(auctionId);
    }
  };

  /** Resolves false when the user cancels the USDG approval. */
  const ensureUsdcApproval = async (
    bidWei: bigint,
    loadingToast: string | number
  ): Promise<boolean> => {
    let approvalSent = false;
    const ok = await ensureErc20Allowance(CONTRACTS.usdc, bidWei, () => {
      approvalSent = true;
      toast.loading(t('toast.approving'), { id: loadingToast });
    });
    if (ok && approvalSent) {
      toast.loading(t('toast.approvedPlacing'), { id: loadingToast });
    }
    return ok;
  };

  // ── Place bid handler ──────────────────────────────
  const handlePlaceBid = async () => {
    if (!(selectedAuction && address)) {
      return;
    }

    const bidWei = parseAmountInput(bidAmount, selectedAuction.paymentDecimals);
    if (bidWei === null) {
      toast.error(t('toast.invalidBid'));
      return;
    }

    const validationError = getBidValidationError(selectedAuction, bidWei, t);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setIsSubmitting(true);
    const loadingToast = toast.loading(t('toast.placing'));

    try {
      const approved = await ensureUsdcApproval(bidWei, loadingToast);
      if (!approved) {
        toast.dismiss(loadingToast);
        toast.error(t('toast.approvalCancelled'));
        setIsSubmitting(false);
        return;
      }

      const txHash = await placeBid(
        Number.parseInt(selectedAuction.id, 10),
        bidWei
      );
      if (!txHash) {
        throw new Error(t('error.bidFailed'));
      }
      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
        });
        if (receipt.status !== 'success') {
          throw new Error(t('error.bidFailed'));
        }
      }

      toast.dismiss(loadingToast);
      toast.success(t('toast.bidPlaced'));

      const bidAuctionId = selectedAuction.id;
      closeBidDialog();
      await fetchAuctions();
      await fetchBidHistory(bidAuctionId);
    } catch (error) {
      toast.dismiss(loadingToast);
      showBidError(error, t);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Finalize auction handler (seller/anyone after end) ──
  const handleFinalize = async (auctionId: string) => {
    setFinalizingId(auctionId);
    const loadingToast = toast.loading(t('toast.finalizing'));
    try {
      const txHash = await finalizeAuction(Number.parseInt(auctionId, 10));
      if (txHash && publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: txHash });
      }
      toast.dismiss(loadingToast);
      toast.success(t('toast.finalized'));
      await fetchAuctions();
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error(getErrorMessage(error, t('error.finalizeFailed')));
    } finally {
      setFinalizingId(null);
    }
  };

  // ── Cancel auction handler (seller only, no bids) ──
  const handleCancel = async (auctionId: string) => {
    setCancellingId(auctionId);
    const loadingToast = toast.loading(t('toast.cancelling'));
    try {
      const txHash = await cancelAuction(Number.parseInt(auctionId, 10));
      if (txHash && publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: txHash });
      }
      toast.dismiss(loadingToast);
      toast.success(t('toast.cancelled'));
      await fetchAuctions();
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error(getErrorMessage(error, t('error.cancelFailed')));
    } finally {
      setCancellingId(null);
    }
  };

  const emptyDescription = getEmptyDescription(filterStatus, t);

  let content: ReactNode = (
    <div className='col-span-full'>
      <EmptyState
        description={emptyDescription}
        icon={<Search className='size-8' />}
        title={t('empty.title')}
      />
    </div>
  );

  if (!isConnected) {
    content = (
      <div className='col-span-full'>
        <EmptyState
          description={t('empty.notConnectedDescription')}
          icon={<Wallet className='size-8' />}
          title={t('empty.notConnectedTitle')}
        />
      </div>
    );
  } else if (isLoading) {
    content = (
      <>
        <Skeleton className='h-56 rounded-none' />
        <Skeleton className='h-56 rounded-none' />
      </>
    );
  } else if (filteredAuctions.length > 0) {
    content = filteredAuctions.map((auction) => (
      <AuctionCard
        address={address}
        auction={auction}
        history={bidHistory[auction.id]}
        isCancelling={cancellingId === auction.id}
        isFinalizing={finalizingId === auction.id}
        isHistoryOpen={showBidHistoryFor === auction.id}
        key={auction.id}
        now={now}
        onBid={openBidDialog}
        onCancel={handleCancel}
        onFinalize={handleFinalize}
        onToggleHistory={toggleBidHistory}
        role={getUserRole(auction, address, bidHistory[auction.id])}
      />
    ));
  }

  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div>
          <h1 className='font-semibold text-2xl tracking-tight'>
            {t('page.title')}
          </h1>
          <p className='text-muted-foreground'>{t('page.description')}</p>
        </div>
        <div className='flex items-center gap-2'>
          {isConnected ? (
            <Button
              disabled={isLoading}
              onClick={() => fetchAuctions()}
              size='sm'
              type='button'
              variant='outline'
            >
              <RefreshCw className={isLoading ? 'animate-spin' : ''} />
              {t('page.refresh')}
            </Button>
          ) : null}
          <Button asChild size='sm'>
            <Link href='/app/sell-credits'>
              <Plus /> {t('page.create')}
            </Link>
          </Button>
        </div>
      </div>

      {isConnected ? <PendingClaimBanner /> : null}

      <div className='flex flex-col gap-4 md:flex-row'>
        <div className='relative flex-1'>
          <Search className='pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            aria-label={t('page.searchLabel')}
            className='rounded-none pl-9'
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder={t('page.searchPlaceholder')}
            value={searchTerm}
          />
        </div>
        <div className='flex flex-wrap gap-2'>
          {AUCTION_FILTERS.map(({ key, labelKey }) => (
            <Button
              key={key}
              onClick={() => setFilterStatus(key)}
              size='sm'
              type='button'
              variant={filterStatus === key ? 'default' : 'secondary'}
            >
              {t(labelKey)}
            </Button>
          ))}
        </div>
      </div>

      <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>{content}</div>

      <BidDialog
        address={address}
        auction={selectedAuction}
        bidAmount={bidAmount}
        history={selectedAuction ? bidHistory[selectedAuction.id] : undefined}
        isSubmitting={isSubmitting}
        onBidAmountChange={setBidAmount}
        onClose={closeBidDialog}
        onSubmit={handlePlaceBid}
        role={
          selectedAuction
            ? getUserRole(
                selectedAuction,
                address,
                bidHistory[selectedAuction.id]
              )
            : 'none'
        }
      />
    </div>
  );
};

export default AuctionsPage;
