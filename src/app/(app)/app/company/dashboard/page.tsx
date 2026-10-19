'use client';

import { Building2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { EmptyState } from '@/components/app/empty-state';
import { StatCard } from '@/components/app/stat-card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useContractInteraction } from '@/hooks/use-contract-interaction';
import { useT } from '@/lib/i18n';
import {
  type EmissionPoint,
  isRegistryConfigured,
  type OnchainCompany,
  type RegistrationType,
  readEmissionHistory,
} from '@/lib/registry';
import type { CarbonCredit } from '@/types/carb';
import { messages } from '../_messages';
import {
  CreditsTab,
  EmissionsTab,
  KybBadge,
  OverviewTab,
  RequestsTab,
} from './_components/dashboard-tabs';

const PERCENT = 100;
const TABS = ['overview', 'emissions', 'credits', 'requests'] as const;

interface DashboardData {
  company: OnchainCompany;
  credits: CarbonCredit[];
  history: EmissionPoint[];
}

type LoadState =
  | { status: 'loading' }
  | { status: 'missing'; type: RegistrationType }
  | { status: 'ready'; data: DashboardData };

const useCompanyDashboard = (address: string | undefined) => {
  const { getCompanyData, getRegistrationType, getUserCredits, publicClient } =
    useContractInteraction();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!address) {
      return;
    }
    let cancelled = false;

    const load = async () => {
      const [company, type, credits] = await Promise.all([
        getCompanyData(address),
        getRegistrationType(address),
        getUserCredits(address).catch(() => [] as CarbonCredit[]),
      ]);
      if (cancelled) {
        return;
      }
      if (!company) {
        setState({ status: 'missing', type });
        return;
      }
      setState({
        status: 'ready',
        data: { company, credits: credits ?? [], history: [] },
      });
      if (!publicClient) {
        return;
      }
      try {
        const history = await readEmissionHistory(
          publicClient,
          address,
          company.registeredAt
        );
        if (!cancelled) {
          setState({
            status: 'ready',
            data: { company, credits: credits ?? [], history },
          });
        }
      } catch {
        // History is a best-effort enhancement; totals already come from the registry.
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [
    address,
    getCompanyData,
    getRegistrationType,
    getUserCredits,
    publicClient,
  ]);

  return state;
};

const DashboardSkeleton = () => (
  <div className='space-y-6'>
    <Skeleton className='h-8 w-64' />
    <div className='grid gap-4 md:grid-cols-4'>
      <Skeleton className='h-28 rounded-none' />
      <Skeleton className='h-28 rounded-none' />
      <Skeleton className='h-28 rounded-none' />
      <Skeleton className='h-28 rounded-none' />
    </div>
    <Skeleton className='h-72 rounded-none' />
  </div>
);

const MissingCompany = ({ type }: { type: RegistrationType }) => {
  const t = useT(messages);
  if (type === 'trader') {
    return (
      <EmptyState
        action={
          <Button asChild>
            <Link href='/app/trader/dashboard'>
              {t('common.goToTraderDashboard')}
            </Link>
          </Button>
        }
        description={t('dash.notCompany.desc')}
        icon={<Building2 className='size-8' />}
        title={t('dash.notCompany.title')}
      />
    );
  }
  return (
    <EmptyState
      action={
        <Button asChild>
          <Link href='/app/company/register'>{t('dash.registerCompany')}</Link>
        </Button>
      }
      description={t('dash.notFound.desc')}
      icon={<Building2 className='size-8' />}
      title={t('dash.notFound.title')}
    />
  );
};

const CompanyDashboardPage = () => {
  const t = useT(messages);
  const { address, isConnected } = useAccount();
  const state = useCompanyDashboard(isConnected ? address : undefined);

  if (!isConnected) {
    return (
      <EmptyState
        description={t('dash.connect.desc')}
        icon={<Building2 className='size-8' />}
        title={t('common.connectToViewDashboard')}
      />
    );
  }

  if (!isRegistryConfigured()) {
    return (
      <EmptyState
        description={t('common.registryNotConfiguredDesc')}
        icon={<Building2 className='size-8' />}
        title={t('common.registryNotConfiguredTitle')}
      />
    );
  }

  if (state.status === 'loading' || !address) {
    return <DashboardSkeleton />;
  }

  if (state.status === 'missing') {
    return <MissingCompany type={state.type} />;
  }

  const { company, credits, history } = state.data;
  const totalEmissions = company.scope1 + company.scope2 + company.scope3;
  const availableCredits = credits.reduce(
    (sum, credit) => sum + (Number(credit.co2Tonnes) || 0),
    0
  );
  const creditsDeficit = Math.max(totalEmissions - availableCredits, 0);
  const coverage =
    totalEmissions > 0 ? (availableCredits / totalEmissions) * PERCENT : 0;

  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <h1 className='font-semibold text-2xl tracking-tight'>
            {company.name}
          </h1>
          <p className='text-muted-foreground'>
            {t('dash.legalId')}{' '}
            <span className='text-foreground'>{company.legalId}</span>
          </p>
        </div>
        <KybBadge verified={company.verified} />
      </div>

      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
        <StatCard
          label={t('dash.stat.totalEmissions')}
          subtext={t('dash.stat.totalEmissionsSub')}
          value={totalEmissions.toFixed(2)}
        />
        <StatCard
          label={t('dash.stat.available')}
          subtext={t('dash.stat.availableSub')}
          value={availableCredits.toFixed(2)}
        />
        <StatCard
          label={t('dash.stat.needed')}
          subtext={t('dash.stat.neededSub')}
          value={creditsDeficit.toFixed(2)}
        />
        <StatCard
          label={t('dash.stat.coverage')}
          subtext={t('dash.stat.coverageSub')}
          value={`${coverage.toFixed(1)}%`}
        />
      </div>

      <Tabs defaultValue='overview'>
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger className='capitalize' key={tab} value={tab}>
              {t(`dash.tab.${tab}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value='overview'>
          <OverviewTab
            company={company}
            creditsDeficit={creditsDeficit}
            fullyCovered={
              totalEmissions > 0 && availableCredits >= totalEmissions
            }
            walletAddress={address}
          />
        </TabsContent>
        <TabsContent value='emissions'>
          <EmissionsTab
            company={company}
            history={history}
            totalEmissions={totalEmissions}
          />
        </TabsContent>
        <TabsContent value='credits'>
          <CreditsTab credits={credits} />
        </TabsContent>
        <TabsContent value='requests'>
          <RequestsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CompanyDashboardPage;
