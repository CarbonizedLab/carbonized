'use client';

import { DollarSign, Leaf, RefreshCw, Wallet, Zap } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAccount } from 'wagmi';
import { EmptyState } from '@/components/app/empty-state';
import { StatCard } from '@/components/app/stat-card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CONTRACTS } from '@/config/contracts';
import { useContractInteraction } from '@/hooks/use-contract-interaction';
import {
  type DepositoryCredit,
  fetchDepositoryCredits,
  getCarbonAccountNumber,
  isBackendConfigured,
} from '@/lib/carb-api';
import { formatCarbonTonnes, formatCurrency } from '@/lib/carb-format';
import { useT } from '@/lib/i18n';
import type { CarbonCredit, Order } from '@/types/carb';
import { AccountCard } from './_components/account-card';
import { DepositoryList } from './_components/depository-list';
import { NftCreditsTab } from './_components/nft-credits-tab';
import { OrdersTab } from './_components/orders-tab';
import { OverviewTab } from './_components/overview-tab';
import { RetireDialog } from './_components/retire-dialog';
import { messages } from './_messages';

const TAB_VALUES = ['overview', 'nfts', 'orders', 'depository'] as const;

/** `?retire=` always opens the NFT tab; otherwise honor a valid `?tab=`. */
const resolveTab = (params: {
  get: (name: string) => string | null;
}): string => {
  if (params.get('retire')) {
    return 'nfts';
  }
  const requested = params.get('tab');
  return TAB_VALUES.find((value) => value === requested) ?? 'overview';
};

const CarbonWalletContent = ({ address }: { address: string }) => {
  const { getErc20Balance, getUserCredits, getMarketplaceOrders } =
    useContractInteraction();
  const t = useT(messages);

  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [cctBalance, setCctBalance] = useState<number | null>(null);
  const [nftCredits, setNftCredits] = useState<CarbonCredit[]>([]);
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [depCredits, setDepCredits] = useState<DepositoryCredit[]>([]);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();
  const deepLinkHandled = useRef(false);
  const [tab, setTab] = useState(() => resolveTab(searchParams));
  const [retireTargets, setRetireTargets] = useState<CarbonCredit[] | null>(
    null
  );

  const accountNumber = getCarbonAccountNumber(address);

  const fetchBalances = useCallback(async () => {
    try {
      const [usdc, cct] = await Promise.all([
        getErc20Balance(CONTRACTS.usdc, address).catch(() => 0),
        getErc20Balance(CONTRACTS.carbonCreditToken, address).catch(() => 0),
      ]);
      setUsdcBalance(usdc);
      setCctBalance(cct);
    } catch {
      // balances stay at their previous value
    }
  }, [address, getErc20Balance]);

  const fetchNfts = useCallback(async () => {
    try {
      const credits = await getUserCredits(address);
      setNftCredits(credits || []);
    } catch {
      setNftCredits([]);
    }
  }, [address, getUserCredits]);

  const fetchOrders = useCallback(async () => {
    try {
      const orders = await getMarketplaceOrders();
      setMyOrders(
        (orders || []).filter(
          (o) => o.trader.toLowerCase() === address.toLowerCase() && o.isActive
        )
      );
    } catch {
      setMyOrders([]);
    }
  }, [address, getMarketplaceOrders]);

  const fetchDepository = useCallback(async () => {
    if (!isBackendConfigured()) {
      // The legacy depository backend is optional; the chain is the source of truth.
      setDepCredits([]);
      return;
    }
    try {
      const res = await fetchDepositoryCredits(address, false);
      setDepCredits(res.credits || []);
    } catch {
      setDepCredits([]);
    }
  }, [address]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      fetchBalances(),
      fetchNfts(),
      fetchOrders(),
      fetchDepository(),
    ]).catch(() => undefined);
    setLoading(false);
  }, [fetchBalances, fetchNfts, fetchOrders, fetchDepository]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Deep link from the portfolio: /app/carbon-wallet?retire=<tokenId>[,<tokenId>]
  useEffect(() => {
    const requested = searchParams.get('retire');
    if (loading || deepLinkHandled.current || !requested) {
      return;
    }
    deepLinkHandled.current = true;
    const ids = requested.split(',').map((id) => id.trim());
    const matches = nftCredits.filter(
      (c) => !c.isRetired && ids.includes(String(c.tokenId))
    );
    if (matches.length === 0) {
      toast.error(t('page.deepLinkUnavailable', { id: requested }));
      return;
    }
    setRetireTargets(matches);
  }, [loading, nftCredits, searchParams, t]);

  const activeDepCredits = depCredits.filter((c) => c.status === 'Active');
  const retiredDepCredits = depCredits.filter((c) => c.status === 'Retired');
  const totalDepActive = activeDepCredits.reduce((s, c) => s + c.co2Amount, 0);
  const totalDepRetired = retiredDepCredits.reduce(
    (s, c) => s + c.co2Amount,
    0
  );
  const nftActiveTonnes = nftCredits
    .filter((c) => !c.isRetired)
    .reduce((s, c) => s + c.co2Tonnes, 0);
  const myBuyOrders = myOrders.filter((o) => o.isBuyOrder);
  const mySellOrders = myOrders.filter((o) => !o.isBuyOrder);
  const placeholder = loading ? '...' : undefined;

  return (
    <div className='space-y-6'>
      <div className='flex justify-end'>
        <Button
          disabled={loading}
          onClick={fetchAll}
          size='sm'
          type='button'
          variant='outline'
        >
          <RefreshCw className={loading ? 'animate-spin' : ''} />
          {t('page.refreshAll')}
        </Button>
      </div>

      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
        <AccountCard accountNumber={accountNumber} address={address} />
        <StatCard
          icon={<DollarSign className='size-4' />}
          label={t('stats.usdcBalance')}
          subtext={t('stats.usdcSubtext')}
          value={
            placeholder ??
            (usdcBalance === null ? '$0.00' : formatCurrency(usdcBalance))
          }
        />
        <StatCard
          icon={<Zap className='size-4' />}
          label={t('stats.cctBalance')}
          subtext={t('stats.cctSubtext')}
          value={
            placeholder ??
            (cctBalance === null ? '0' : formatCarbonTonnes(cctBalance))
          }
        />
        <StatCard
          icon={<Leaf className='size-4' />}
          label={t('stats.nftCredits')}
          subtext={t('stats.nftSubtext', {
            tonnes: formatCarbonTonnes(nftActiveTonnes),
          })}
          value={placeholder ?? nftCredits.length}
        />
      </div>

      <div className='grid grid-cols-2 gap-4 sm:grid-cols-5'>
        <StatCard
          label={t('stats.activeOrders')}
          value={loading ? '—' : myOrders.length}
        />
        <StatCard
          label={t('stats.buyOrders')}
          value={loading ? '—' : myBuyOrders.length}
        />
        <StatCard
          label={t('stats.sellOrders')}
          value={loading ? '—' : mySellOrders.length}
        />
        <StatCard
          label={t('stats.depositoryActive')}
          value={loading ? '—' : activeDepCredits.length}
        />
        <StatCard
          label={t('stats.depositoryRetired')}
          value={loading ? '—' : retiredDepCredits.length}
        />
      </div>

      <Tabs onValueChange={setTab} value={tab}>
        <TabsList>
          <TabsTrigger value='overview'>{t('tabs.overview')}</TabsTrigger>
          <TabsTrigger value='nfts'>
            {t('tabs.nfts')}
            {nftCredits.length > 0 ? ` (${nftCredits.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value='orders'>
            {t('tabs.orders')}
            {myOrders.length > 0 ? ` (${myOrders.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value='depository'>
            {t('tabs.depository')}
            {depCredits.length > 0 ? ` (${depCredits.length})` : ''}
          </TabsTrigger>
        </TabsList>

        <TabsContent className='mt-4' value='overview'>
          <OverviewTab
            activeDepCount={activeDepCredits.length}
            cctBalance={cctBalance}
            nftActiveTonnes={nftActiveTonnes}
            nftCount={nftCredits.length}
            orders={myOrders}
            retiredDepCount={retiredDepCredits.length}
            totalDepActive={totalDepActive}
            totalDepRetired={totalDepRetired}
            usdcBalance={usdcBalance}
          />
        </TabsContent>

        <TabsContent className='mt-4' value='nfts'>
          <NftCreditsTab
            credits={nftCredits}
            loading={loading}
            onRetire={setRetireTargets}
          />
        </TabsContent>

        <TabsContent className='mt-4' value='orders'>
          <OrdersTab loading={loading} orders={myOrders} />
        </TabsContent>

        <TabsContent className='mt-4' value='depository'>
          {loading ? (
            <div className='space-y-3'>
              <Skeleton className='h-14' />
              <Skeleton className='h-14' />
              <Skeleton className='h-14' />
            </div>
          ) : (
            <DepositoryList
              address={address}
              credits={depCredits}
              onRetired={fetchDepository}
            />
          )}
        </TabsContent>
      </Tabs>

      <RetireDialog
        credits={retireTargets}
        onClose={() => setRetireTargets(null)}
        onRetired={() => {
          fetchNfts();
          fetchBalances();
        }}
      />
    </div>
  );
};

const CarbonWalletPage = () => {
  const { address, isConnected } = useAccount();
  const t = useT(messages);

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='font-semibold text-2xl tracking-tight'>
          {t('page.title')}
        </h1>
        <p className='text-muted-foreground'>{t('page.subtitle')}</p>
      </div>
      {isConnected && address ? (
        <Suspense fallback={<Skeleton className='h-64 w-full' />}>
          <CarbonWalletContent address={address} />
        </Suspense>
      ) : (
        <EmptyState
          description={t('page.connectDescription')}
          icon={<Wallet className='size-12' />}
          title={t('page.connectTitle')}
        />
      )}
    </div>
  );
};

export default CarbonWalletPage;
