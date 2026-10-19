import {
  ArrowUp,
  CheckCircle2,
  Clock,
  Crown,
  Gavel,
  ShieldCheck,
  Trophy,
  XCircle,
} from 'lucide-react';
import { zeroAddress } from 'viem';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  formatAddress,
  formatCarbonTonnes,
  formatCurrency,
} from '@/lib/carb-format';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { messages } from '../_messages';
import {
  type AuctionItem,
  type AuctionUserRole,
  type BidHistoryEntry,
  formatTimeLeft,
} from './auction-utils';
import { BidHistoryList } from './bid-history-list';
import { Notice, Rich } from './notice';

const SECONDS_PER_HOUR = 3600;
const HOURS_PER_DAY = 24;

const ROLE_BORDER: Record<AuctionUserRole, string> = {
  'highest-bidder': 'border-emerald-500/50',
  outbid: 'border-amber-500/50',
  seller: 'border-primary/50',
  none: '',
};

interface AuctionCardProps {
  auction: AuctionItem;
  role: AuctionUserRole;
  /** Current unix time in seconds; drives live countdowns. */
  now: number;
  address?: string;
  history?: BidHistoryEntry[];
  isHistoryOpen: boolean;
  isFinalizing: boolean;
  isCancelling: boolean;
  onBid: (auction: AuctionItem) => void;
  onFinalize: (auctionId: string) => void;
  onCancel: (auctionId: string) => void;
  onToggleHistory: (auctionId: string) => void;
}

const RoleBadge = ({ role }: { role: AuctionUserRole }) => {
  const t = useT(messages);
  if (role === 'seller') {
    return (
      <Badge className='border-primary/40 text-primary' variant='outline'>
        <Crown /> {t('role.seller')}
      </Badge>
    );
  }
  if (role === 'highest-bidder') {
    return (
      <Badge
        className='border-emerald-500/40 text-emerald-700 dark:text-emerald-400'
        variant='outline'
      >
        <Trophy /> {t('role.highestBidder')}
      </Badge>
    );
  }
  if (role === 'outbid') {
    return (
      <Badge
        className='border-amber-500/40 text-amber-700 dark:text-amber-400'
        variant='outline'
      >
        <ArrowUp /> {t('role.outbid')}
      </Badge>
    );
  }
  return null;
};

const TimeBadge = ({ secondsLeft }: { secondsLeft: number }) => {
  const t = useT(messages);
  const hoursLeft = secondsLeft / SECONDS_PER_HOUR;
  if (hoursLeft < 0) {
    return <Badge variant='destructive'>{t('badge.ended')}</Badge>;
  }

  const amber = 'border-amber-500/40 text-amber-700 dark:text-amber-400';
  if (hoursLeft < 1) {
    return (
      <Badge className={amber} variant='outline'>
        {t('badge.endingSoon')}
      </Badge>
    );
  }
  if (hoursLeft < HOURS_PER_DAY) {
    return (
      <Badge className={amber} variant='outline'>
        {t('badge.hoursLeft', { hours: Math.floor(hoursLeft) })}
      </Badge>
    );
  }
  return (
    <Badge
      className='border-emerald-500/40 text-emerald-700 dark:text-emerald-400'
      variant='outline'
    >
      {t('badge.active')}
    </Badge>
  );
};

interface HistoryPanelProps {
  address?: string;
  history?: BidHistoryEntry[];
  isHistoryOpen: boolean;
}

const HistoryPanel = ({
  address,
  history,
  isHistoryOpen,
}: HistoryPanelProps) => {
  const t = useT(messages);
  if (!(isHistoryOpen && history)) {
    return null;
  }
  return (
    <div className='max-h-40 space-y-2 overflow-y-auto border border-dashed p-3'>
      <p className='font-semibold text-muted-foreground text-xs'>
        {t('card.bidHistory')}
      </p>
      <BidHistoryList
        address={address}
        emptyLabel={t('card.noBidEvents')}
        entries={history}
      />
    </div>
  );
};

const getBidLabelKey = (role: AuctionUserRole): string => {
  if (role === 'outbid') {
    return 'action.placeHigher';
  }
  if (role === 'highest-bidder') {
    return 'action.increase';
  }
  return 'action.place';
};

interface BidderActionProps {
  auction: AuctionItem;
  role: AuctionUserRole;
  hasEnded: boolean;
  isFinalizing: boolean;
  onBid: (auction: AuctionItem) => void;
  onFinalize: (auctionId: string) => void;
}

const BidderAction = ({
  auction,
  role,
  hasEnded,
  isFinalizing,
  onBid,
  onFinalize,
}: BidderActionProps) => {
  const t = useT(messages);
  if (auction.status === 'active' && !hasEnded) {
    return (
      <Button
        className='flex-1'
        onClick={() => onBid(auction)}
        size='sm'
        type='button'
      >
        <Gavel /> {t(getBidLabelKey(role))}
      </Button>
    );
  }
  if (hasEnded && role === 'highest-bidder') {
    return (
      <Button
        className='flex-1'
        disabled={isFinalizing}
        onClick={() => onFinalize(auction.id)}
        size='sm'
        type='button'
      >
        <Trophy />{' '}
        {isFinalizing ? t('action.finalizing') : t('action.finalizeClaim')}
      </Button>
    );
  }
  if (hasEnded) {
    return (
      <Button className='flex-1' disabled size='sm' type='button'>
        {t('action.ended')}
      </Button>
    );
  }
  return null;
};

interface RoleNoticeProps {
  auction: AuctionItem;
  role: AuctionUserRole;
  hasEnded: boolean;
  isFinalizing: boolean;
  onBid: (auction: AuctionItem) => void;
  onFinalize: (auctionId: string) => void;
}

const RoleNotice = ({
  auction,
  role,
  hasEnded,
  isFinalizing,
  onBid,
  onFinalize,
}: RoleNoticeProps) => {
  const t = useT(messages);
  if (role === 'highest-bidder' && !hasEnded) {
    return (
      <Notice icon={<CheckCircle2 />} tone='success'>
        <p>
          <Rich text={t('notice.highestHeld')} />
        </p>
      </Notice>
    );
  }
  if (role === 'highest-bidder') {
    return (
      <Notice
        action={
          <Button
            className='shrink-0'
            disabled={isFinalizing}
            onClick={() => onFinalize(auction.id)}
            size='sm'
            type='button'
          >
            {isFinalizing ? t('action.finalizing') : t('action.claim')}
          </Button>
        }
        icon={<Trophy />}
        tone='success'
      >
        <p>
          <Rich
            text={t('notice.won', {
              amount: formatCarbonTonnes(auction.quantity),
            })}
          />
        </p>
      </Notice>
    );
  }
  if (role === 'outbid' && !hasEnded) {
    return (
      <Notice
        action={
          <Button
            className='shrink-0'
            onClick={() => onBid(auction)}
            size='sm'
            type='button'
            variant='secondary'
          >
            {t('action.bidHigher')}
          </Button>
        }
        icon={<ArrowUp />}
        tone='warning'
      >
        <p>
          <Rich text={t('notice.outbidActive')} />
        </p>
      </Notice>
    );
  }
  if (role === 'outbid') {
    return (
      <Notice icon={<XCircle />} tone='muted'>
        <p>{t('notice.outbidEnded')}</p>
      </Notice>
    );
  }
  return null;
};

interface SellerControlsProps {
  auction: AuctionItem;
  address?: string;
  history?: BidHistoryEntry[];
  hasEnded: boolean;
  hasHighestBidder: boolean;
  timeLeft: string;
  isHistoryOpen: boolean;
  isFinalizing: boolean;
  isCancelling: boolean;
  onFinalize: (auctionId: string) => void;
  onCancel: (auctionId: string) => void;
  onToggleHistory: (auctionId: string) => void;
}

const SellerControls = ({
  auction,
  address,
  history,
  hasEnded,
  hasHighestBidder,
  timeLeft,
  isHistoryOpen,
  isFinalizing,
  isCancelling,
  onFinalize,
  onCancel,
  onToggleHistory,
}: SellerControlsProps) => {
  const t = useT(messages);
  return (
    <div className='space-y-3 border border-primary/40 border-dashed bg-primary/5 p-3'>
      <div className='flex items-center gap-2 text-primary text-sm'>
        <Crown className='size-4' />
        <strong>{t('seller.controls')}</strong>
      </div>

      {hasHighestBidder ? (
        <div className='space-y-2'>
          <div className='flex items-center justify-between text-sm'>
            <span className='text-muted-foreground'>
              {t('seller.highestBid')}
            </span>
            <span className='font-bold'>
              {formatCurrency(auction.currentBid)}
            </span>
          </div>
          <div className='flex items-center justify-between text-sm'>
            <span className='text-muted-foreground'>{t('seller.bidder')}</span>
            <span className='font-mono'>
              {formatAddress(auction.highestBidder, 6)}
            </span>
          </div>
          <button
            className='text-primary text-xs underline underline-offset-2 hover:opacity-80'
            onClick={() => onToggleHistory(auction.id)}
            type='button'
          >
            {isHistoryOpen ? t('seller.hideHistory') : t('seller.viewHistory')}
          </button>

          <HistoryPanel
            address={address}
            history={history}
            isHistoryOpen={isHistoryOpen}
          />

          {hasEnded ? (
            <Button
              className='mt-2 w-full'
              disabled={isFinalizing}
              onClick={() => onFinalize(auction.id)}
              size='sm'
              type='button'
            >
              <ShieldCheck />
              {isFinalizing
                ? t('action.finalizing')
                : t('seller.acceptFinalize', {
                    amount: formatCurrency(auction.currentBid),
                  })}
            </Button>
          ) : (
            <p className='mt-1 flex items-center gap-1 text-muted-foreground text-xs'>
              <Clock className='size-3' />
              {t('seller.finalizeLater', { time: timeLeft })}
            </p>
          )}
        </div>
      ) : (
        <div className='space-y-2'>
          <p className='text-muted-foreground text-xs'>{t('seller.noBids')}</p>
          <Button
            className='w-full'
            disabled={isCancelling}
            onClick={() => onCancel(auction.id)}
            size='sm'
            type='button'
            variant='secondary'
          >
            {isCancelling ? t('seller.cancelling') : t('seller.cancel')}
          </Button>
        </div>
      )}
    </div>
  );
};

const HighestBid = ({
  auction,
  hasHighestBidder,
}: {
  auction: AuctionItem;
  hasHighestBidder: boolean;
}) => {
  const t = useT(messages);
  return (
    <div className='space-y-2 border-t border-dashed pt-4'>
      {hasHighestBidder ? (
        <>
          <div className='flex items-center justify-between'>
            <p className='font-semibold text-primary text-sm'>
              {t('card.currentHighest')}
            </p>
            <p className='font-bold text-xl'>
              {formatCurrency(auction.currentBid)}
            </p>
          </div>
          <p className='text-muted-foreground text-xs'>
            {t('card.by', { address: formatAddress(auction.highestBidder, 6) })}
          </p>
        </>
      ) : (
        <p className='text-muted-foreground text-sm italic'>
          {t('card.noBids')}
        </p>
      )}
    </div>
  );
};

export const AuctionCard = ({
  auction,
  role,
  now,
  address,
  history,
  isHistoryOpen,
  isFinalizing,
  isCancelling,
  onBid,
  onFinalize,
  onCancel,
  onToggleHistory,
}: AuctionCardProps) => {
  const t = useT(messages);
  const secondsLeft = auction.endTime - now;
  const hasEnded = secondsLeft <= 0;
  const hasBids = auction.currentBid > 0;
  const hasHighestBidder = hasBids && auction.highestBidder !== zeroAddress;
  const timeLeft = formatTimeLeft(secondsLeft, t);

  return (
    <Card
      className={cn(
        'rounded-none border-dashed shadow-none transition-colors',
        ROLE_BORDER[role]
      )}
    >
      <CardContent className='space-y-4'>
        <div className='space-y-2'>
          <div className='flex items-start justify-between gap-2'>
            <h3 className='font-semibold text-lg tracking-tight'>
              {t('card.title', { id: auction.id })}
            </h3>
            <div className='flex shrink-0 flex-wrap items-center justify-end gap-2'>
              <RoleBadge role={role} />
              <TimeBadge secondsLeft={secondsLeft} />
            </div>
          </div>
          <p className='text-muted-foreground text-sm'>
            {t('card.seller', { address: formatAddress(auction.seller, 6) })}
          </p>
        </div>

        <div className='grid grid-cols-2 gap-3 text-sm'>
          <div className='border border-dashed p-3'>
            <p className='text-muted-foreground text-xs'>
              {t('card.quantity')}
            </p>
            <p className='font-semibold'>
              {formatCarbonTonnes(auction.quantity)}
            </p>
          </div>
          <div className='border border-dashed p-3'>
            <p className='text-muted-foreground text-xs'>
              {t('card.startingPrice')}
            </p>
            <p className='font-semibold'>
              {formatCurrency(auction.startingPrice)}
            </p>
          </div>
        </div>

        <HighestBid auction={auction} hasHighestBidder={hasHighestBidder} />

        <RoleNotice
          auction={auction}
          hasEnded={hasEnded}
          isFinalizing={isFinalizing}
          onBid={onBid}
          onFinalize={onFinalize}
          role={role}
        />

        {role === 'seller' ? (
          <SellerControls
            address={address}
            auction={auction}
            hasEnded={hasEnded}
            hasHighestBidder={hasHighestBidder}
            history={history}
            isCancelling={isCancelling}
            isFinalizing={isFinalizing}
            isHistoryOpen={isHistoryOpen}
            onCancel={onCancel}
            onFinalize={onFinalize}
            onToggleHistory={onToggleHistory}
            timeLeft={timeLeft}
          />
        ) : null}

        <div className='flex items-center gap-2 border border-dashed p-3 text-sm'>
          <Clock className='size-4 shrink-0 text-amber-600 dark:text-amber-400' />
          <span className='tabular-nums'>{timeLeft}</span>
        </div>

        {role === 'seller' ? null : (
          <>
            <div className='flex gap-2'>
              <BidderAction
                auction={auction}
                hasEnded={hasEnded}
                isFinalizing={isFinalizing}
                onBid={onBid}
                onFinalize={onFinalize}
                role={role}
              />
              {hasBids ? (
                <Button
                  onClick={() => onToggleHistory(auction.id)}
                  size='sm'
                  type='button'
                  variant='secondary'
                >
                  {isHistoryOpen ? t('card.hideBids') : t('card.viewBids')}
                </Button>
              ) : null}
            </div>
            <HistoryPanel
              address={address}
              history={history}
              isHistoryOpen={isHistoryOpen}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
};
