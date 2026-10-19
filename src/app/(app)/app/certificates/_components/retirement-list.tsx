'use client';

import { Award } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatChainDate, formatDecimal } from '@/lib/chain-format';
import { useLocaleStore, useT } from '@/lib/i18n';
import type { ChainEvent } from '@/lib/onchain-events';
import { buildCertificateId } from '@/lib/retirement';
import { cn } from '@/lib/utils';
import { messages } from '../_messages';

interface RetirementListProps {
  events: ChainEvent[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

export const eventKey = (event: ChainEvent): string =>
  `${event.txHash}:${event.tokenId ?? ''}`;

export const RetirementList = ({
  events,
  selectedKey,
  onSelect,
}: RetirementListProps) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);

  return (
    <ul aria-label={t('list.aria')} className='space-y-2'>
      {events.map((event) => {
        const key = eventKey(event);
        const active = key === selectedKey;
        return (
          <li key={key}>
            <button
              aria-pressed={active}
              className={cn(
                'w-full border border-dashed p-3 text-left transition-colors hover:bg-accent',
                active && 'border-primary bg-accent'
              )}
              onClick={() => onSelect(key)}
              type='button'
            >
              <span className='flex items-center justify-between gap-2'>
                <span className='flex items-center gap-1.5 font-mono text-xs'>
                  <Award className='size-3.5 text-primary' />
                  {buildCertificateId(event.tokenId ?? 0n, event.txHash)}
                </span>
                <Badge className='rounded-none' variant='outline'>
                  {formatDecimal(event.tonnes ?? 0, locale)} t
                </Badge>
              </span>
              <span className='mt-1 block truncate text-sm' title={event.note}>
                {event.note || t('list.noReason')}
              </span>
              <span className='block text-muted-foreground text-xs'>
                {formatChainDate(event.timestamp, locale)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
};
