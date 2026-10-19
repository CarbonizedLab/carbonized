'use client';

import { Coins, Flame, Gem, Layers } from 'lucide-react';
import { StatCard } from '@/components/app/stat-card';
import {
  bpsToPercent,
  CARB,
  formatKarb,
  type StakePosition,
  type TokenAccount,
  type TokenInfo,
} from '@/lib/carb';
import { useLocaleStore, useT } from '@/lib/i18n';
import { messages } from '../_messages';

interface QueryState<T> {
  data: T | undefined;
  isLoading: boolean;
}

interface TokenStatsProps {
  connected: boolean;
  info: QueryState<TokenInfo>;
  account: QueryState<TokenAccount>;
  position: QueryState<StakePosition>;
}

export const TokenStats = ({
  connected,
  info,
  account,
  position,
}: TokenStatsProps) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);

  const symbol = info.data?.symbol ?? 'CARB';
  const decimals = info.data?.decimals;
  const amount = (wei: bigint) =>
    decimals === undefined
      ? t('stat.loading')
      : formatKarb(wei, locale, decimals);

  /** Value of a wallet-bound stat: connect prompt, loading marker, dash on failure, or the formatted data. */
  const walletValue = <T,>(
    query: QueryState<T>,
    format: (data: T) => string
  ): string => {
    if (!connected) {
      return t('stat.connect');
    }
    if (query.data) {
      return format(query.data);
    }
    return query.isLoading ? t('stat.loading') : t('stat.unavailable');
  };

  let supply = info.isLoading ? t('stat.loading') : t('stat.unavailable');
  if (info.data) {
    supply = `${amount(info.data.totalSupply)} ${symbol}`;
  }

  let tierNote = t('stat.connectNote');
  if (connected && !CARB.staking) {
    tierNote = t('staking.missing');
  } else if (connected && position.data) {
    tierNote = t('stat.tierNote', {
      percent: bpsToPercent(position.data.discountBps),
    });
  } else if (connected) {
    tierNote = '';
  }

  return (
    <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
      <StatCard
        icon={<Coins className='size-5' />}
        label={t('stat.supply')}
        subtext={t('stat.supplyNote')}
        value={supply}
      />
      <StatCard
        icon={<Gem className='size-5' />}
        label={t('stat.balance')}
        subtext={t('stat.balanceNote')}
        value={walletValue(account, (data) => amount(data.balance))}
      />
      <StatCard
        icon={<Layers className='size-5' />}
        label={t('stat.tier')}
        subtext={tierNote}
        value={walletValue(position, (data) =>
          t('stat.tierValue', { tier: data.tier })
        )}
      />
      <StatCard
        icon={<Flame className='size-5' />}
        label={t('stat.staked')}
        subtext={t('stat.stakedNote')}
        value={walletValue(position, (data) =>
          amount(data.matured + data.pending)
        )}
      />
    </div>
  );
};
