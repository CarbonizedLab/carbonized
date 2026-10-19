import { AlertCircle, ArrowUp, CheckCircle2, Gavel, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  formatAddress,
  formatCarbonTonnes,
  formatCurrency,
} from '@/lib/carb-format';
import { useT } from '@/lib/i18n';
import { messages } from '../_messages';
import type {
  AuctionItem,
  AuctionUserRole,
  BidHistoryEntry,
} from './auction-utils';
import { BidHistoryList } from './bid-history-list';
import { Notice, Rich } from './notice';

const RECENT_BIDS_LIMIT = 5;

interface BidDialogProps {
  auction: AuctionItem | null;
  role: AuctionUserRole;
  address?: string;
  history?: BidHistoryEntry[];
  bidAmount: string;
  isSubmitting: boolean;
  onBidAmountChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

const RoleNotice = ({ role }: { role: AuctionUserRole }) => {
  const t = useT(messages);
  if (role === 'outbid') {
    return (
      <Notice icon={<ArrowUp />} tone='warning'>
        <p>
          <Rich text={t('dialog.outbidNotice')} />
        </p>
      </Notice>
    );
  }
  if (role === 'highest-bidder') {
    return (
      <Notice icon={<CheckCircle2 />} tone='success'>
        <p>{t('dialog.highestNotice')}</p>
      </Notice>
    );
  }
  return null;
};

interface BidPreviewProps {
  auction: AuctionItem;
  bidValue: number;
  isBelowCurrent: boolean;
}

const BidPreview = ({ auction, bidValue, isBelowCurrent }: BidPreviewProps) => {
  const t = useT(messages);
  return (
    <div className='space-y-1.5 border border-dashed p-3'>
      <div className='flex justify-between text-sm'>
        <span className='text-muted-foreground'>{t('preview.yourBid')}</span>
        <span className='font-medium'>{formatCurrency(bidValue)}</span>
      </div>
      <div className='flex justify-between text-sm'>
        <span className='text-muted-foreground'>{t('preview.quantity')}</span>
        <span className='font-medium'>
          {formatCarbonTonnes(auction.quantity)}
        </span>
      </div>
      <div className='flex justify-between text-sm'>
        <span className='text-muted-foreground'>
          {t('preview.pricePerTonne')}
        </span>
        <span className='font-medium'>
          {formatCurrency(
            auction.quantity > 0 ? bidValue / auction.quantity : 0
          )}
        </span>
      </div>
      {isBelowCurrent ? (
        <p className='mt-1 text-destructive text-xs'>
          {t('preview.belowCurrent', {
            amount: formatCurrency(auction.currentBid),
          })}
        </p>
      ) : null}
    </div>
  );
};

export const BidDialog = ({
  auction,
  role,
  address,
  history,
  bidAmount,
  isSubmitting,
  onBidAmountChange,
  onSubmit,
  onClose,
}: BidDialogProps) => {
  const t = useT(messages);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isOpen = auction !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (isOpen && !dialog.open) {
      dialog.showModal();
    }
    if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  const bidValue = Number.parseFloat(bidAmount);
  const hasBidValue = bidValue > 0;
  const isBelowCurrent =
    auction !== null &&
    auction.currentBid > 0 &&
    bidValue <= auction.currentBid;

  return (
    <dialog
      aria-labelledby='bid-dialog-title'
      className='m-auto w-full max-w-md border border-dashed bg-background p-0 text-foreground backdrop:bg-black/70 backdrop:backdrop-blur-sm'
      onCancel={(event) => {
        if (isSubmitting) {
          event.preventDefault();
        }
      }}
      onClose={onClose}
      ref={dialogRef}
    >
      {auction ? (
        <form
          className='space-y-5 p-6'
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className='flex items-start justify-between'>
            <div>
              <h2
                className='font-semibold text-2xl tracking-tight'
                id='bid-dialog-title'
              >
                {t('dialog.title')}
              </h2>
              <p className='text-muted-foreground text-sm'>
                {t('dialog.subtitle', {
                  id: auction.id,
                  quantity: formatCarbonTonnes(auction.quantity),
                })}
              </p>
            </div>
            <Button
              aria-label={t('dialog.close')}
              disabled={isSubmitting}
              onClick={onClose}
              size='icon'
              type='button'
              variant='ghost'
            >
              <X />
            </Button>
          </div>

          <p className='text-muted-foreground text-sm'>
            {t('dialog.seller')}{' '}
            <span className='font-mono'>
              {formatAddress(auction.seller, 6)}
            </span>
          </p>

          <div className='space-y-2 border border-dashed p-4'>
            <p className='text-muted-foreground text-sm'>
              {t('dialog.currentHighest')}
            </p>
            <p className='font-bold text-3xl tracking-tight'>
              {auction.currentBid > 0
                ? formatCurrency(auction.currentBid)
                : t('dialog.noBids')}
            </p>
            {auction.currentBid > 0 ? (
              <p className='text-muted-foreground text-xs'>
                {t('dialog.by', {
                  address: formatAddress(auction.highestBidder, 6),
                })}
              </p>
            ) : null}
          </div>

          <RoleNotice role={role} />

          <div className='space-y-3'>
            <div className='space-y-2'>
              <Label htmlFor='bid-amount'>{t('dialog.bidLabel')}</Label>
              <Input
                disabled={isSubmitting}
                id='bid-amount'
                onChange={(event) => onBidAmountChange(event.target.value)}
                placeholder={
                  auction.currentBid > 0
                    ? t('dialog.placeholderMust', {
                        amount: formatCurrency(auction.currentBid),
                      })
                    : t('dialog.placeholderMin', {
                        amount: formatCurrency(auction.startingPrice),
                      })
                }
                step='0.01'
                type='number'
                value={bidAmount}
              />
            </div>

            {hasBidValue ? (
              <BidPreview
                auction={auction}
                bidValue={bidValue}
                isBelowCurrent={isBelowCurrent}
              />
            ) : null}
          </div>

          <Notice icon={<AlertCircle />} tone='warning'>
            <p>
              <Rich text={t('dialog.holdNotice')} />
            </p>
          </Notice>

          {history && history.length > 0 ? (
            <div className='space-y-1.5'>
              <p className='font-semibold text-muted-foreground text-xs'>
                {t('dialog.recent')}
              </p>
              <BidHistoryList
                address={address}
                entries={history}
                limit={RECENT_BIDS_LIMIT}
              />
            </div>
          ) : null}

          <div className='flex gap-3'>
            <Button
              disabled={isSubmitting}
              onClick={onClose}
              type='button'
              variant='secondary'
            >
              {t('dialog.cancel')}
            </Button>
            <Button
              className='flex-1'
              disabled={isSubmitting || !hasBidValue}
              type='submit'
            >
              <Gavel />{' '}
              {isSubmitting ? t('dialog.placing') : t('dialog.confirm')}
            </Button>
          </div>
        </form>
      ) : null}
    </dialog>
  );
};
