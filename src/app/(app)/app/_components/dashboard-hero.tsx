'use client';

import { BadgeCheck, Leaf, Loader2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WalletButton } from '@/components/web3/wallet-button';
import { formatAddress } from '@/lib/carb-format';
import { useT } from '@/lib/i18n';
import type { ProfileKind } from '../_lib/types';
import { useFormatters } from '../_lib/use-formatters';
import { messages } from '../_messages';

interface DashboardHeroProps {
  /** Company or trader name from the registry, when available. */
  name?: string;
  address?: string;
  isConnected: boolean;
  kind: ProfileKind | null;
  verified: boolean;
  syncedAt?: number;
  isSyncing: boolean;
  onSync: () => void;
  blockNumber?: bigint;
  chainName?: string;
}

export const DashboardHero = ({
  name,
  address,
  isConnected,
  kind,
  verified,
  syncedAt,
  isSyncing,
  onSync,
  blockNumber,
  chainName,
}: DashboardHeroProps) => {
  const t = useT(messages);
  const { relative } = useFormatters();
  const displayName = name ?? (address ? formatAddress(address) : undefined);

  return (
    <section className='relative overflow-hidden border border-dashed bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-6 sm:p-8'>
      <Leaf
        aria-hidden='true'
        className='pointer-events-none absolute -right-6 -bottom-8 size-48 text-primary/10'
      />
      <div className='relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between'>
        <div className='min-w-0 space-y-3'>
          <p className='flex flex-wrap items-center gap-2 font-medium text-primary text-xs uppercase tracking-widest'>
            {t('hero.eyebrow')}
            {chainName ? (
              <Badge
                className='gap-1.5 rounded-none border-dashed font-normal normal-case tracking-normal'
                variant='outline'
              >
                <span className='size-1.5 animate-pulse rounded-full bg-emerald-500' />
                {chainName}
              </Badge>
            ) : null}
            {blockNumber === undefined ? null : (
              <Badge
                className='rounded-none border-dashed font-normal normal-case tracking-normal'
                variant='outline'
              >
                {t('hero.block', { block: blockNumber.toString() })}
              </Badge>
            )}
          </p>
          <h1 className='text-balance font-bold text-3xl tracking-tight sm:text-4xl'>
            {displayName
              ? t('hero.welcome', { name: displayName })
              : t('hero.welcomeGuest')}
          </h1>
          <p className='max-w-2xl text-muted-foreground text-sm sm:text-base'>
            {isConnected ? t('hero.subtitle') : t('hero.subtitleGuest')}
          </p>
          {kind && kind !== 'none' ? (
            <div className='flex flex-wrap items-center gap-2'>
              <Badge variant='secondary'>{t(`hero.kind.${kind}`)}</Badge>
              {verified ? (
                <Badge
                  className='gap-1 text-emerald-600 dark:text-emerald-400'
                  variant='outline'
                >
                  <BadgeCheck />
                  {t('hero.verified')}
                </Badge>
              ) : (
                <Badge className='text-muted-foreground' variant='outline'>
                  {t('hero.unverified')}
                </Badge>
              )}
            </div>
          ) : null}
        </div>

        <div className='flex flex-col items-start gap-3 lg:items-end'>
          <div className='flex flex-wrap items-center gap-2'>
            {isConnected ? null : <WalletButton />}
            <Button
              aria-busy={isSyncing}
              disabled={isSyncing}
              onClick={onSync}
              size='sm'
              type='button'
              variant='outline'
            >
              {isSyncing ? <Loader2 className='animate-spin' /> : <RefreshCw />}
              {isSyncing ? t('hero.syncing') : t('hero.sync')}
            </Button>
          </div>
          <p aria-live='polite' className='text-muted-foreground text-xs'>
            {syncedAt
              ? t('hero.lastSynced', { time: relative(syncedAt) })
              : t('hero.loading')}
          </p>
        </div>
      </div>
    </section>
  );
};
