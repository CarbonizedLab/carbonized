'use client';

import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { NetworkBanner } from '@/components/network-banner';
import { Web3Provider } from '@/components/web3/web3-provider';
import { CONTRACTS } from '@/config/contracts';
import { useLocaleStore, useT } from '@/lib/i18n';
import { AppSidebar, MobileNavDrawer } from './app-sidebar';
import { AppTopbar } from './app-topbar';
import { navMessages } from './nav-messages';

const ZERO_ADDRESS_PATTERN = /^0x0{40}$/;
const DESKTOP_QUERY = '(min-width: 1024px)';
const COLLAPSED_STORAGE_KEY = 'carb-sidebar-collapsed';
const MOBILE_DRAWER_ID = 'app-mobile-nav';
const CONTENT_ID = 'app-content';

const isMissingAddress = (value: string | undefined): boolean =>
  !value || value === '0x' || ZERO_ADDRESS_PATTERN.test(value);

/** Entries not yet present in `CONTRACTS` (e.g. the registry) are skipped. */
const OPTIONAL_CONTRACTS: Record<string, string | undefined> = CONTRACTS;

const getMissingConfig = (): string[] => {
  const contractEnv: [string, string | undefined][] = [
    ['NEXT_PUBLIC_CARBON_CREDIT_NFT', CONTRACTS.carbonCreditNFT],
    ['NEXT_PUBLIC_CARBON_CREDIT_TOKEN', CONTRACTS.carbonCreditToken],
    ['NEXT_PUBLIC_CARBON_MARKETPLACE', CONTRACTS.carbonMarketplace],
    ['NEXT_PUBLIC_CARBON_PRICE_ORACLE', CONTRACTS.carbonPriceOracle],
    ['NEXT_PUBLIC_EMISSION_VERIFIER', CONTRACTS.emissionVerifier],
    ['NEXT_PUBLIC_USDG_ADDRESS', CONTRACTS.usdc],
  ];
  if ('carbonRegistry' in OPTIONAL_CONTRACTS) {
    contractEnv.push([
      'NEXT_PUBLIC_CARBON_REGISTRY',
      OPTIONAL_CONTRACTS.carbonRegistry,
    ]);
  }
  return contractEnv
    .filter(([, value]) => isMissingAddress(value))
    .map(([name]) => name);
};

const useSidebarCollapsed = (): [boolean, () => void] => {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1');
  }, []);

  const toggle = () => {
    const next = !collapsed;
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? '1' : '0');
    setCollapsed(next);
  };

  return [collapsed, toggle];
};

const useCloseDrawerOnDesktop = (close: () => void) => {
  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        close();
      }
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [close]);
};

const AppFrame = ({ children }: { children: ReactNode }) => {
  const t = useT(navMessages);
  const [collapsed, toggleCollapsed] = useSidebarCollapsed();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const missingConfig = getMissingConfig();
  const contractsConfigured = missingConfig.length === 0;

  useEffect(() => {
    useLocaleStore.getState().hydrate();
  }, []);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  useCloseDrawerOnDesktop(closeDrawer);

  return (
    <div className='flex h-dvh w-full overflow-hidden bg-background'>
      <a
        className='sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:border focus:bg-background focus:px-3 focus:py-2 focus:text-sm'
        href={`#${CONTENT_ID}`}
      >
        {t('sidebar.skip')}
      </a>
      <AppSidebar
        collapsed={collapsed}
        contractsConfigured={contractsConfigured}
        onToggleCollapsed={toggleCollapsed}
      />
      <MobileNavDrawer
        contractsConfigured={contractsConfigured}
        id={MOBILE_DRAWER_ID}
        onClose={closeDrawer}
        open={drawerOpen}
      />
      <div className='flex h-full min-w-0 flex-1 flex-col'>
        <AppTopbar
          menuControlsId={MOBILE_DRAWER_ID}
          menuLabel={t('sidebar.openMenu')}
          menuOpen={drawerOpen}
          onOpenMenu={() => setDrawerOpen(true)}
        />
        <NetworkBanner />
        {contractsConfigured ? null : (
          <output className='block border-b border-dashed bg-amber-500/10 px-4 py-2 text-amber-700 text-xs lg:px-6 dark:text-amber-300'>
            {t('banner.missing', { list: missingConfig.join(', ') })}
          </output>
        )}
        <main
          className='min-h-0 flex-1 overflow-y-auto scroll-smooth outline-none'
          id={CONTENT_ID}
          tabIndex={-1}
        >
          <div className='mx-auto w-full max-w-7xl px-4 py-8 lg:px-6'>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export const AppShell = ({ children }: { children: ReactNode }) => (
  <Web3Provider>
    <AppFrame>{children}</AppFrame>
  </Web3Provider>
);
