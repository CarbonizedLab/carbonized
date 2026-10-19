'use client';

import { useQuery } from '@tanstack/react-query';
import { Menu } from 'lucide-react';
import { formatUnits } from 'viem';
import { useAccount, useBalance } from 'wagmi';
import { ThemeToggle } from '@/components/theme-toggle';
import { Skeleton } from '@/components/ui/skeleton';
import { WalletButton } from '@/components/web3/wallet-button';
import { CONTRACTS } from '@/config/contracts';
import { targetChain } from '@/config/wagmi';
import { useContractInteraction } from '@/hooks/use-contract-interaction';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { LanguageToggle } from './language-toggle';
import { navMessages } from './nav-messages';

const BALANCE_REFETCH_MS = 15_000;
const PROFILE_STALE_MS = 15_000;
const ETH_FORMAT = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 4,
});
const USDG_FORMAT = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
});

type ProfileKind = 'company' | 'trader';

interface Profile {
  name: string;
  kind: ProfileKind;
}

/** Registry getters return either a tuple (name first) or an object with `name`. */
const readName = (value: unknown): string => {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0].trim() : '';
  }
  if (value && typeof value === 'object' && 'name' in value) {
    return typeof value.name === 'string' ? value.name.trim() : '';
  }
  return '';
};

const useProfile = (): Profile | null => {
  const { address, isConnected } = useAccount();
  const { getCompanyData, getTraderData } = useContractInteraction();

  const { data } = useQuery<Profile | null>({
    queryKey: ['app-profile', address],
    enabled: isConnected && Boolean(address),
    staleTime: PROFILE_STALE_MS,
    queryFn: async () => {
      if (!address) {
        return null;
      }
      const companyName = readName(await getCompanyData(address));
      if (companyName) {
        return { name: companyName, kind: 'company' };
      }
      const traderName = readName(await getTraderData(address));
      return traderName ? { name: traderName, kind: 'trader' } : null;
    },
  });

  return data ?? null;
};

const TopbarTitle = () => {
  const t = useT(navMessages);
  const profile = useProfile();

  let subtitle = t('topbar.subtitleDefault');
  if (profile?.kind === 'company') {
    subtitle = t('topbar.subtitleCompany');
  } else if (profile?.kind === 'trader') {
    subtitle = t('topbar.subtitleTrader');
  }

  return (
    <div className='min-w-0'>
      <p className='truncate font-semibold text-sm leading-tight'>
        {profile?.name ?? t('topbar.defaultTitle')}
      </p>
      <p className='hidden truncate text-muted-foreground text-xs sm:block'>
        {subtitle}
      </p>
    </div>
  );
};

const NetworkPill = () => {
  const t = useT(navMessages);
  const { isConnected, chainId } = useAccount();
  const wrongNetwork = isConnected && chainId !== targetChain.id;
  const live = isConnected && !wrongNetwork;

  return (
    <output
      aria-label={t('topbar.network')}
      className='flex items-center gap-2 border border-dashed px-2.5 py-1 text-xs'
    >
      <span aria-hidden='true' className='relative flex size-2'>
        {live ? (
          <span className='absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60' />
        ) : null}
        <span
          className={cn(
            'relative inline-flex size-2 rounded-full',
            live && 'bg-emerald-500',
            wrongNetwork && 'bg-amber-500',
            !(live || wrongNetwork) && 'bg-muted-foreground/50'
          )}
        />
      </span>
      <span className='max-w-40 truncate font-medium'>
        {wrongNetwork ? t('topbar.networkWrong') : targetChain.name}
      </span>
    </output>
  );
};

const BalanceItem = ({
  label,
  value,
  loading,
}: {
  label: string;
  value: string;
  loading: boolean;
}) => (
  <div className='flex items-baseline gap-1.5'>
    {loading ? (
      <Skeleton className='h-4 w-12' />
    ) : (
      <span className='font-semibold tabular-nums'>{value}</span>
    )}
    <span className='text-muted-foreground text-xs'>{label}</span>
  </div>
);

const WalletBalances = () => {
  const t = useT(navMessages);
  const { address, isConnected } = useAccount();
  const { getErc20Balance } = useContractInteraction();

  const native = useBalance({
    address,
    chainId: targetChain.id,
    query: {
      enabled: isConnected && Boolean(address),
      refetchInterval: BALANCE_REFETCH_MS,
    },
  });

  const usdc = useQuery<number>({
    queryKey: ['app-usdc-balance', address, CONTRACTS.usdc],
    enabled: isConnected && Boolean(address),
    refetchInterval: BALANCE_REFETCH_MS,
    queryFn: () => (address ? getErc20Balance(CONTRACTS.usdc, address) : 0),
  });

  if (!isConnected) {
    return null;
  }

  const symbol = native.data?.symbol ?? targetChain.nativeCurrency.symbol;
  const ethValue = ETH_FORMAT.format(
    native.data
      ? Number(formatUnits(native.data.value, native.data.decimals))
      : 0
  );

  return (
    <section
      aria-busy={native.isLoading || usdc.isLoading}
      aria-label={t('topbar.balance')}
      className='hidden items-center gap-3 border border-dashed px-2.5 py-1 text-sm md:flex'
    >
      <BalanceItem label={symbol} loading={native.isLoading} value={ethValue} />
      <span aria-hidden='true' className='h-4 border-l border-dashed' />
      <BalanceItem
        label={t('topbar.usdc')}
        loading={usdc.isLoading}
        value={USDG_FORMAT.format(usdc.data ?? 0)}
      />
    </section>
  );
};

export const AppTopbar = ({
  menuControlsId,
  menuOpen,
  menuLabel,
  onOpenMenu,
}: {
  menuControlsId: string;
  menuOpen: boolean;
  menuLabel: string;
  onOpenMenu: () => void;
}) => (
  <div className='z-20 flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-dashed bg-background/80 px-4 py-2 backdrop-blur-lg lg:px-6'>
    <button
      aria-controls={menuControlsId}
      aria-expanded={menuOpen}
      aria-haspopup='dialog'
      aria-label={menuLabel}
      className='inline-flex size-9 shrink-0 items-center justify-center border border-dashed transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring lg:hidden'
      onClick={onOpenMenu}
      type='button'
    >
      <Menu aria-hidden='true' className='size-4' />
    </button>
    <div className='flex-1 basis-32'>
      <TopbarTitle />
    </div>
    <div className='flex flex-wrap items-center justify-end gap-2'>
      <NetworkPill />
      <WalletBalances />
      <LanguageToggle />
      <ThemeToggle mode='light-dark' />
      <WalletButton />
    </div>
  </div>
);
