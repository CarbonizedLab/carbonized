import { Badge } from '@/components/ui/badge';
import { formatAddress, formatCurrency } from '@/lib/carb-format';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { messages } from '../_messages';
import { type BidHistoryEntry, isSameAddress } from './auction-utils';

interface BidHistoryListProps {
  entries: BidHistoryEntry[];
  address?: string;
  /** Limit rows shown (e.g. recent bids inside the bid dialog). */
  limit?: number;
  emptyLabel?: string;
  className?: string;
}

export const BidHistoryList = ({
  entries,
  address,
  limit,
  emptyLabel,
  className,
}: BidHistoryListProps) => {
  const t = useT(messages);
  if (entries.length === 0) {
    return (
      <p className='py-2 text-center text-muted-foreground text-xs'>
        {emptyLabel ?? t('history.empty')}
      </p>
    );
  }

  const visible = limit ? entries.slice(0, limit) : entries;

  return (
    <ul className={cn('space-y-1', className)}>
      {visible.map((entry, index) => {
        const isYou = isSameAddress(entry.bidder, address);
        const isHighest = index === 0;
        return (
          <li
            className={cn(
              'flex items-center justify-between gap-2 px-2 py-1.5 text-xs',
              isYou && 'bg-primary/10 text-primary',
              !isYou &&
                isHighest &&
                'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
              !(isYou || isHighest) && 'text-muted-foreground'
            )}
            key={entry.id}
          >
            <span className='font-mono'>
              {formatAddress(entry.bidder, 4)}
              {isYou ? t('history.you') : ''}
            </span>
            <span className='flex items-center gap-2'>
              <span className='font-medium'>
                {formatCurrency(entry.amount)}
              </span>
              {isHighest ? (
                <Badge
                  className='border-emerald-500/40 text-emerald-700 dark:text-emerald-400'
                  variant='outline'
                >
                  {t('history.highest')}
                </Badge>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
};
