'use client';

import { Leaf, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAccount } from 'wagmi';
import { EmptyState } from '@/components/app/empty-state';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  downloadCsv,
  type EmissionRecord,
  type EmissionsLedger,
  GRID_FACTOR_ID,
  getFactor,
  loadLedger,
  monthlyBreakdown,
  recordsToCsv,
  saveLedger,
  sumByScope,
} from '@/lib/emissions-tracker';
import { useT } from '@/lib/i18n';
import { ActivityForm, type ActivityInput } from './_components/activity-form';
import { EmissionKpis } from './_components/emission-kpis';
import { FactorTable } from './_components/factor-table';
import { GridFactorCard } from './_components/grid-factor-card';
import { MonthlyChart } from './_components/monthly-chart';
import { OnChainSyncCard } from './_components/onchain-sync-card';
import { RecordsTable } from './_components/records-table';
import { useOnChainTotals } from './_components/use-onchain-totals';
import { messages } from './_messages';

const YEAR_SPAN = 5;
const EPSILON = 1e-9;

const createId = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const LoadingState = () => (
  <div className='space-y-4'>
    <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
      {['s1', 's2', 's3', 'total'].map((key) => (
        <Skeleton className='h-28 rounded-none' key={key} />
      ))}
    </div>
    <Skeleton className='h-80 rounded-none' />
  </div>
);

const EmissionsPage = () => {
  const t = useT(messages);
  const { address, isConnected } = useAccount();
  const [currentYear] = useState(() => new Date().getFullYear());
  const [year, setYear] = useState(currentYear);
  const [ledger, setLedger] = useState<EmissionsLedger | null>(null);
  const onChain = useOnChainTotals(address);

  useEffect(() => {
    setLedger(address ? loadLedger(address, year) : null);
  }, [address, year]);

  const years = Array.from({ length: YEAR_SPAN }, (_, i) => currentYear - i);
  const defaultMonth = year === currentYear ? new Date().getMonth() + 1 : 1;

  const commit = (next: EmissionsLedger) => {
    setLedger(next);
    if (address && !saveLedger(address, year, next)) {
      toast.error(t('toast.storageFailed'));
    }
  };

  const addRecord = (input: ActivityInput) => {
    if (!ledger) {
      return;
    }
    const factor =
      input.factorId === GRID_FACTOR_ID
        ? ledger.gridFactor
        : (getFactor(input.factorId)?.factor ?? 0);
    const record: EmissionRecord = {
      id: createId(),
      month: input.month,
      factorId: input.factorId,
      quantity: input.quantity,
      factor,
      kgCo2e: input.quantity * factor,
      note: input.note,
      createdAt: Date.now(),
    };
    commit({ ...ledger, records: [...ledger.records, record] });
    toast.success(t('toast.added'));
  };

  const deleteRecord = (id: string) => {
    if (!ledger) {
      return;
    }
    const removed = ledger.records.find((record) => record.id === id);
    if (!removed) {
      return;
    }
    const previous = ledger;
    commit({
      ...ledger,
      records: ledger.records.filter((record) => record.id !== id),
    });
    toast(t('toast.deleted'), {
      action: { label: t('toast.undo'), onClick: () => commit(previous) },
    });
  };

  const saveGridFactor = (gridFactor: number) => {
    if (ledger) {
      commit({ ...ledger, gridFactor });
      toast.success(t('toast.gridSaved'));
    }
  };

  const staleRecords = (ledger?.records ?? []).filter(
    (record) =>
      record.factorId === GRID_FACTOR_ID &&
      Math.abs(record.factor - (ledger?.gridFactor ?? 0)) > EPSILON
  ).length;

  const recalculateGrid = () => {
    if (!ledger) {
      return;
    }
    commit({
      ...ledger,
      records: ledger.records.map((record) =>
        record.factorId === GRID_FACTOR_ID
          ? {
              ...record,
              factor: ledger.gridFactor,
              kgCo2e: record.quantity * ledger.gridFactor,
            }
          : record
      ),
    });
    toast.success(t('toast.recalculated'));
  };

  const exportCsv = () => {
    if (!ledger) {
      return;
    }
    downloadCsv(
      `carb-emissions-${year}.csv`,
      recordsToCsv(ledger.records, year)
    );
    toast.success(t('toast.exported'));
  };

  const totals = sumByScope(ledger?.records ?? []);

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
    if (!ledger) {
      return <LoadingState />;
    }
    return (
      <div className='space-y-6'>
        <EmissionKpis totals={totals} />
        <div className='grid gap-6 xl:grid-cols-5'>
          <div className='xl:col-span-2'>
            <ActivityForm
              defaultMonth={defaultMonth}
              gridFactor={ledger.gridFactor}
              key={`${address}-${year}`}
              onAdd={addRecord}
            />
          </div>
          <div className='xl:col-span-3'>
            <MonthlyChart
              data={monthlyBreakdown(ledger.records)}
              total={totals.total}
              year={year}
            />
          </div>
        </div>
        <RecordsTable
          onDelete={deleteRecord}
          onExport={exportCsv}
          records={ledger.records}
        />
        <div className='grid gap-6 lg:grid-cols-2'>
          <GridFactorCard
            gridFactor={ledger.gridFactor}
            key={`${year}-${ledger.gridFactor}`}
            onRecalculate={recalculateGrid}
            onSave={saveGridFactor}
            staleRecords={staleRecords}
          />
          <OnChainSyncCard
            configured={onChain.configured}
            isSyncing={onChain.isSyncing}
            local={totals}
            onChain={onChain.totals}
            onRefresh={onChain.refresh}
            onSync={() => onChain.sync(totals)}
            status={onChain.status}
            year={year}
          />
        </div>
        <FactorTable gridFactor={ledger.gridFactor} />
      </div>
    );
  };

  return (
    <div className='mx-auto max-w-7xl space-y-6'>
      <div className='flex flex-wrap items-end justify-between gap-4'>
        <div className='space-y-1'>
          <div className='flex items-center gap-2'>
            <Leaf className='size-5 text-primary' />
            <h1 className='font-bold text-2xl tracking-tight'>
              {t('page.title')}
            </h1>
            <Badge variant='outline'>{t('page.badge')}</Badge>
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

export default EmissionsPage;
