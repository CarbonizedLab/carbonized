'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useNowSeconds } from '@/hooks/use-carb-tx';
import {
  formatDuration,
  formatKarb,
  type StakePosition,
  type StakingParams,
} from '@/lib/carb';
import { formatChainDate } from '@/lib/chain-format';
import { useLocaleStore, useT } from '@/lib/i18n';
import { messages } from '../_messages';

interface PositionCardProps {
  position: StakePosition;
  params: StakingParams;
  symbol: string;
  decimals: number;
}

const Row = ({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) => (
  <div className='flex flex-col gap-0.5 border-b border-dashed py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4'>
    <dt className='font-medium text-sm'>{label}</dt>
    <dd className='text-sm sm:text-right'>
      <span className='font-semibold'>{value}</span>
      {note ? (
        <span className='block text-muted-foreground text-xs'>{note}</span>
      ) : null}
    </dd>
  </div>
);

/** Matured / warming-up / cooling-down stake with the countdowns of the staking contract. */
export const PositionCard = ({
  position,
  params,
  symbol,
  decimals,
}: PositionCardProps) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);
  const now = useNowSeconds();

  const amount = (wei: bigint) =>
    `${formatKarb(wei, locale, decimals)} ${symbol}`;

  const warmupEnds = position.pendingSince + params.warmup;
  const warming = position.pending > 0n && now < warmupEnds;
  const cooling = position.cooling > 0n;
  const coolingDone = cooling && now >= position.unlockAt;
  const empty = position.matured + position.pending + position.cooling === 0n;

  const nextTier = params.tiers.find((tier) => tier.tier === position.tier + 1);
  const missing = nextTier ? nextTier.threshold - position.effective : 0n;

  let coolingNote: string | undefined;
  if (cooling) {
    coolingNote = coolingDone
      ? t('pos.coolingReady')
      : t('pos.coolingNote', {
          time: formatDuration(position.unlockAt - now, locale),
          date: formatChainDate(position.unlockAt, locale),
        });
  }

  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle>{t('pos.title')}</CardTitle>
        <CardDescription>{t('pos.description')}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {empty ? (
          <p className='text-muted-foreground text-sm'>{t('pos.none')}</p>
        ) : (
          <dl>
            <Row label={t('pos.counting')} value={amount(position.effective)} />
            {warming ? (
              <Row
                label={t('pos.warming')}
                note={t('pos.warmingNote', {
                  time: formatDuration(warmupEnds - now, locale),
                  date: formatChainDate(warmupEnds, locale),
                })}
                value={amount(position.pending)}
              />
            ) : null}
            {cooling ? (
              <Row
                label={t('pos.cooling')}
                note={coolingNote}
                value={amount(position.cooling)}
              />
            ) : null}
          </dl>
        )}
        <p className='text-muted-foreground text-xs'>
          {nextTier
            ? t('pos.nextTier', {
                tier: nextTier.tier,
                amount: formatKarb(nextTier.threshold, locale, decimals),
                symbol,
                missing: formatKarb(
                  missing > 0n ? missing : 0n,
                  locale,
                  decimals
                ),
              })
            : t('pos.topTier')}
        </p>
        <p className='text-muted-foreground text-xs'>{t('pos.noVotes')}</p>
      </CardContent>
    </Card>
  );
};
