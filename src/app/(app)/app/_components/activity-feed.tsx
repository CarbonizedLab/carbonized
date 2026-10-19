'use client';

import {
  Activity,
  ArrowDownUp,
  ExternalLink,
  Flame,
  Gavel,
  Layers,
  type LucideIcon,
  PackageOpen,
  Sprout,
  Tag,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatAddress } from '@/lib/carb-format';
import { useT } from '@/lib/i18n';
import type { ChainEvent, ChainEventKind } from '@/lib/onchain-events';
import { useFormatters } from '../_lib/use-formatters';
import { messages } from '../_messages';

interface ActivityFeedProps {
  events: ChainEvent[] | null;
  account?: string;
  explorerUrl?: string;
}

const MAX_ITEMS = 8;
const SKELETON_KEYS = ['a', 'b', 'c', 'd', 'e'] as const;

const ICONS: Record<ChainEventKind, LucideIcon> = {
  mint: Sprout,
  retire: Flame,
  wrap: Layers,
  unwrap: PackageOpen,
  order_created: Tag,
  order_filled: ArrowDownUp,
  order_cancelled: XCircle,
  auction_created: Gavel,
  bid: Gavel,
  auction_finalized: Gavel,
  auction_cancelled: XCircle,
};

const ActivityRow = ({
  event,
  isMine,
  explorerUrl,
}: {
  event: ChainEvent;
  isMine: boolean;
  explorerUrl?: string;
}) => {
  const t = useT(messages);
  const { tonnes, usd, relative } = useFormatters();
  const Icon = ICONS[event.kind];

  const parts: string[] = [];
  if (event.tonnes !== undefined) {
    parts.push(tonnes(event.tonnes));
  }
  if (event.usd !== undefined) {
    parts.push(usd(event.usd));
  }
  if (event.refId !== undefined && event.tokenId === undefined) {
    parts.push(`#${event.refId.toString()}`);
  }
  if (event.tokenId !== undefined) {
    parts.push(`NFT #${event.tokenId.toString()}`);
  }
  if (event.actor) {
    parts.push(formatAddress(event.actor));
  }

  return (
    <li className='flex items-start gap-3 border-b border-dashed py-3 last:border-b-0'>
      <span className='mt-0.5 flex size-8 shrink-0 items-center justify-center border border-dashed text-primary'>
        <Icon aria-hidden='true' className='size-4' />
      </span>
      <div className='min-w-0 flex-1'>
        <p className='flex flex-wrap items-center gap-2 font-medium text-sm'>
          {t(`activity.kind.${event.kind}`)}
          {isMine ? (
            <Badge variant='secondary'>{t('activity.you')}</Badge>
          ) : null}
        </p>
        <p className='truncate text-muted-foreground text-xs'>
          {parts.join(' · ')}
        </p>
      </div>
      <div className='flex shrink-0 flex-col items-end gap-1 text-right'>
        <span className='text-muted-foreground text-xs'>
          {event.timestamp > 0 ? relative(event.timestamp) : '—'}
        </span>
        {explorerUrl ? (
          <a
            aria-label={t('activity.viewTx')}
            className='inline-flex items-center gap-1 text-primary text-xs hover:underline'
            href={`${explorerUrl}/tx/${event.txHash}`}
            rel='noopener noreferrer'
            target='_blank'
          >
            {formatAddress(event.txHash, 3)}
            <ExternalLink className='size-3' />
          </a>
        ) : null}
      </div>
    </li>
  );
};

export const ActivityFeed = ({
  events,
  account,
  explorerUrl,
}: ActivityFeedProps) => {
  const t = useT(messages);
  const recent = events?.slice(0, MAX_ITEMS);

  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-lg'>
          <Activity className='size-5 text-primary' />
          {t('activity.title')}
        </CardTitle>
        <p className='text-muted-foreground text-xs'>{t('activity.desc')}</p>
      </CardHeader>
      <CardContent>
        {recent ? null : (
          <div className='space-y-3'>
            {SKELETON_KEYS.map((key) => (
              <Skeleton className='h-12 w-full rounded-none' key={key} />
            ))}
          </div>
        )}
        {recent?.length === 0 ? (
          <p className='py-8 text-center text-muted-foreground text-sm'>
            {t('activity.empty')}
          </p>
        ) : null}
        {recent && recent.length > 0 ? (
          <ul>
            {recent.map((event) => (
              <ActivityRow
                event={event}
                explorerUrl={explorerUrl}
                isMine={
                  Boolean(account) &&
                  event.actor?.toLowerCase() === account?.toLowerCase()
                }
                key={`${event.txHash}-${event.logIndex}`}
              />
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
};
