import { Flame, Leaf } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/app/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCarbonTonnes } from '@/lib/carb-format';
import { useT } from '@/lib/i18n';
import type { CarbonCredit } from '@/types/carb';
import { messages } from '../_messages';
import { SUCCESS_TEXT } from './wallet-styles';

interface NftCreditCardProps {
  credit: CarbonCredit;
  selected: boolean;
  onToggle: (tokenId: number) => void;
  onRetire: (credits: CarbonCredit[]) => void;
}

const NftCreditCard = ({
  credit: c,
  selected,
  onToggle,
  onRetire,
}: NftCreditCardProps) => {
  const t = useT(messages);
  return (
    <Card
      className={`rounded-none border-dashed shadow-none ${selected ? 'border-primary' : ''}`}
    >
      <CardContent className='space-y-3'>
        <div className='flex items-start justify-between gap-2'>
          <div className='flex items-start gap-2'>
            {c.isRetired ? null : (
              <input
                aria-label={t('nft.selectAria', { id: c.tokenId })}
                checked={selected}
                className='mt-1 size-4 accent-primary'
                onChange={() => onToggle(c.tokenId)}
                type='checkbox'
              />
            )}
            <div>
              <p className='font-semibold'>{c.projectName}</p>
              <p className='font-mono text-muted-foreground text-xs'>
                {t('nft.token', { id: c.tokenId })}
              </p>
            </div>
          </div>
          <Badge
            className={c.isRetired ? 'text-muted-foreground' : SUCCESS_TEXT}
            variant='outline'
          >
            {c.isRetired ? t('nft.retired') : t('nft.active')}
          </Badge>
        </div>
        <div className='grid grid-cols-3 gap-3 text-xs'>
          <div>
            <p className='text-muted-foreground'>{t('nft.tonnes')}</p>
            <p className='font-semibold text-sm'>
              {formatCarbonTonnes(c.co2Tonnes)}
            </p>
          </div>
          <div>
            <p className='text-muted-foreground'>{t('nft.vintage')}</p>
            <p className='font-medium'>{c.vintageYear}</p>
          </div>
          <div>
            <p className='text-muted-foreground'>{t('nft.methodology')}</p>
            <p className='truncate font-medium' title={c.methodology}>
              {c.methodology}
            </p>
          </div>
        </div>
        <div className='flex items-center justify-between gap-2'>
          {c.geography ? (
            <p className='text-muted-foreground text-xs'>📍 {c.geography}</p>
          ) : (
            <span />
          )}
          {c.isRetired ? null : (
            <Button
              onClick={() => onRetire([c])}
              size='sm'
              type='button'
              variant='outline'
            >
              <Flame />
              {t('nft.retire')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

interface NftCreditsTabProps {
  loading: boolean;
  credits: CarbonCredit[];
  /** Opens the onchain retire dialog for the given credits. */
  onRetire: (credits: CarbonCredit[]) => void;
}

export const NftCreditsTab = ({
  loading,
  credits,
  onRetire,
}: NftCreditsTabProps) => {
  const t = useT(messages);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  if (loading) {
    return (
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
        <Skeleton className='h-28' />
        <Skeleton className='h-28' />
        <Skeleton className='h-28' />
      </div>
    );
  }
  if (credits.length === 0) {
    return (
      <EmptyState
        description={t('nft.emptyDescription')}
        icon={<Leaf className='size-12' />}
        title={t('nft.emptyTitle')}
      />
    );
  }

  const active = credits.filter((c) => !c.isRetired);
  const selected = active.filter((c) => selectedIds.includes(c.tokenId));
  const allSelected = active.length > 0 && selected.length === active.length;

  const toggle = (tokenId: number) =>
    setSelectedIds((ids) =>
      ids.includes(tokenId)
        ? ids.filter((id) => id !== tokenId)
        : [...ids, tokenId]
    );

  return (
    <div className='space-y-4'>
      {active.length > 0 ? (
        <div className='flex flex-wrap items-center justify-between gap-2 border border-dashed p-3'>
          <label
            className='flex items-center gap-2 text-sm'
            htmlFor='nft-select-all'
          >
            <input
              checked={allSelected}
              className='size-4 accent-primary'
              id='nft-select-all'
              onChange={() =>
                setSelectedIds(allSelected ? [] : active.map((c) => c.tokenId))
              }
              type='checkbox'
            />
            {t('nft.selectAll')}
          </label>
          <Button
            disabled={selected.length === 0}
            onClick={() => onRetire(selected)}
            type='button'
          >
            <Flame />
            {t('nft.retireSelected', { count: selected.length })}
          </Button>
        </div>
      ) : null}
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
        {credits.map((c) => (
          <NftCreditCard
            credit={c}
            key={c.id}
            onRetire={onRetire}
            onToggle={toggle}
            selected={selectedIds.includes(c.tokenId)}
          />
        ))}
      </div>
    </div>
  );
};
