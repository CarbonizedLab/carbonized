'use client';

import { Coins, Flame, Percent, ShieldCheck, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAccount } from 'wagmi';
import { EmptyState } from '@/components/app/empty-state';
import { StatCard } from '@/components/app/stat-card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatNumber } from '@/lib/emissions-tracker';
import { useLocaleStore, useT } from '@/lib/i18n';
import { IsoChecklist } from './_components/iso-checklist';
import { RegistrySummary } from './_components/registry-summary';
import { SurplusCalculator } from './_components/surplus-calculator';
import { nftConfigured, useAssessData } from './_components/use-assess-data';
import { computeAllocation, summarizeByMethodology } from './_lib/allocation';
import {
  emptyIsoState,
  type IsoState,
  loadIsoState,
  saveIsoState,
} from './_lib/iso-state';
import { messages } from './_messages';

const YEAR_SPAN = 5;
const DEFAULT_RESERVE_PCT = 20;

const AssessPage = () => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);
  const { address, isConnected } = useAccount();
  const [currentYear] = useState(() => new Date().getFullYear());
  const [year, setYear] = useState(currentYear);
  const [reservePct, setReservePct] = useState(DEFAULT_RESERVE_PCT);
  const [iso, setIso] = useState<IsoState>(emptyIsoState);
  const { credits, creditsStatus, emissions, recordCount } = useAssessData(
    address,
    year
  );

  useEffect(() => {
    setIso(address ? loadIsoState(address) : emptyIsoState());
  }, [address]);

  const updateIso = (next: IsoState) => {
    setIso(next);
    if (address && !saveIsoState(address, next)) {
      toast.error(t('toast.storageFailed'));
    }
  };

  const summaries = summarizeByMethodology(credits);
  const eligible = summaries.reduce((sum, row) => sum + row.eligible, 0);
  const allocation = computeAllocation(
    eligible,
    emissions?.total ?? 0,
    reservePct
  );
  const years = Array.from({ length: YEAR_SPAN }, (_, i) => currentYear - i);
  const isLoading = creditsStatus === 'loading' || emissions === null;

  const tonnes = (value: number) =>
    `${formatNumber(value, locale, 2)} ${t('unit.tco2e')}`;
  const coverageText =
    allocation.coveragePct === null
      ? '—'
      : `${formatNumber(allocation.coveragePct, locale, 1)}%`;

  const renderBody = () => {
    if (!(isConnected && address)) {
      return (
        <EmptyState
          description={t('empty.description')}
          icon={<Wallet className='size-10' />}
          title={t('empty.title')}
        />
      );
    }
    return (
      <div className='space-y-6'>
        <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
          <StatCard
            icon={<Coins className='size-4' />}
            label={t('kpi.eligible')}
            subtext={t('kpi.eligibleHint')}
            value={isLoading ? '…' : tonnes(allocation.eligible)}
          />
          <StatCard
            icon={<Flame className='size-4' />}
            label={t('kpi.emissions', { year })}
            subtext={t('kpi.emissionsHint', { count: recordCount })}
            value={isLoading ? '…' : tonnes(allocation.need)}
          />
          <StatCard
            icon={<Percent className='size-4' />}
            label={t('kpi.coverage')}
            subtext={
              allocation.coveragePct === null
                ? t('kpi.coverageNone')
                : t('kpi.coverageHint')
            }
            value={isLoading ? '…' : coverageText}
          />
          <StatCard
            icon={<ShieldCheck className='size-4' />}
            label={t('kpi.sellable')}
            subtext={t('kpi.sellableHint')}
            value={isLoading ? '…' : tonnes(allocation.sellable)}
          />
        </div>

        <div className='grid gap-6 lg:grid-cols-2'>
          <IsoChecklist
            hasTrackerData={recordCount > 0}
            maxYear={currentYear}
            onChange={updateIso}
            state={iso}
          />
          <RegistrySummary
            configured={nftConfigured}
            status={creditsStatus}
            summaries={summaries}
          />
        </div>

        <SurplusCalculator
          allocation={allocation}
          onReservePctChange={setReservePct}
          reservePct={reservePct}
          year={year}
        />
      </div>
    );
  };

  return (
    <div className='mx-auto max-w-7xl space-y-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div className='space-y-1'>
          <div className='flex items-center gap-2'>
            <ShieldCheck className='size-5 text-primary' />
            <h1 className='font-bold text-2xl tracking-tight'>
              {t('page.title')}
            </h1>
            <Badge variant='outline'>ISO 14064</Badge>
          </div>
          <p className='max-w-2xl text-muted-foreground text-sm'>
            {t('page.description')}
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <label className='text-muted-foreground text-sm' htmlFor='year'>
            {t('page.year')}
          </label>
          <Select
            onValueChange={(value) => setYear(Number(value))}
            value={String(year)}
          >
            <SelectTrigger className='w-28' id='year'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((value) => (
                <SelectItem key={value} value={String(value)}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {renderBody()}
    </div>
  );
};

export default AssessPage;
