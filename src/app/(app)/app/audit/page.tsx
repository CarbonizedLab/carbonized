'use client';

import {
  AlertTriangle,
  Download,
  FileDown,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/app/empty-state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/lib/i18n';
import type { ChainEvent } from '@/lib/onchain-events';
import { AuditKpis } from './_components/audit-kpis';
import { AuditPrintReport } from './_components/audit-print-report';
import { LedgerSection } from './_components/ledger-section';
import { ReconciliationPanel } from './_components/reconciliation-panel';
import {
  downloadTextFile,
  EMPTY_FILTERS,
  eventsToCsv,
  filterEvents,
  type LedgerFilters,
} from './_lib/ledger';
import { type AuditData, useAuditData } from './_lib/use-audit-data';
import { messages } from './_messages';

const AuditLoading = () => (
  <div className='space-y-6'>
    <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
      <Skeleton className='h-28 rounded-none' />
      <Skeleton className='h-28 rounded-none' />
      <Skeleton className='h-28 rounded-none' />
      <Skeleton className='h-28 rounded-none' />
    </div>
    <Skeleton className='h-72 rounded-none' />
    <Skeleton className='h-96 rounded-none' />
  </div>
);

const AuditReady = ({
  data,
  filters,
  onFiltersChange,
  filtered,
}: {
  data: AuditData;
  filters: LedgerFilters;
  onFiltersChange: (next: LedgerFilters) => void;
  filtered: ChainEvent[];
}) => {
  const t = useT(messages);
  return (
    <div className='space-y-6'>
      {data.errors.length > 0 ? (
        <Alert
          className='rounded-none border-amber-500/50 border-dashed text-amber-700 dark:text-amber-300'
          role='alert'
        >
          <AlertTriangle />
          <AlertTitle>{t('errors.partial')}</AlertTitle>
          <AlertDescription>
            <ul className='list-disc pl-4 font-mono text-xs'>
              {data.errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      <AuditKpis data={data} />
      <ReconciliationPanel data={data} />
      <LedgerSection
        events={data.events}
        filtered={filtered}
        filters={filters}
        onFiltersChange={onFiltersChange}
      />
      <AuditPrintReport data={data} events={filtered} />
    </div>
  );
};

const AuditPage = () => {
  const t = useT(messages);
  const { state, reload } = useAuditData();
  const [filters, setFilters] = useState<LedgerFilters>(EMPTY_FILTERS);

  const events = state.status === 'ready' ? state.data.events : null;
  const filtered = useMemo(
    () => (events ? filterEvents(events, filters) : []),
    [events, filters]
  );

  const handleExport = () => {
    if (filtered.length === 0) {
      toast.error(t('actions.nothingToExport'));
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(`carb-audit-ledger-${stamp}.csv`, eventsToCsv(filtered));
    toast.success(t('actions.exported', { count: filtered.length }));
  };

  const isReady = state.status === 'ready';

  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h1 className='font-semibold text-2xl tracking-tight'>
            {t('page.title')}
          </h1>
          <p className='max-w-2xl text-muted-foreground'>
            {t('page.subtitle')}
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button
            disabled={state.status === 'loading'}
            onClick={reload}
            type='button'
            variant='outline'
          >
            <RefreshCw
              className={state.status === 'loading' ? 'animate-spin' : ''}
            />
            {t('actions.refresh')}
          </Button>
          <Button
            disabled={!isReady}
            onClick={handleExport}
            type='button'
            variant='outline'
          >
            <Download />
            {t('actions.exportCsv')}
          </Button>
          <Button
            disabled={!isReady}
            onClick={() => window.print()}
            type='button'
          >
            <FileDown />
            {t('actions.downloadPdf')}
          </Button>
        </div>
      </div>

      {state.status === 'loading' ? <AuditLoading /> : null}
      {state.status === 'unconfigured' ? (
        <EmptyState
          description={t('unconfigured.description')}
          icon={<ShieldAlert className='size-12' />}
          title={t('unconfigured.title')}
        />
      ) : null}
      {state.status === 'error' ? (
        <Alert className='rounded-none border-dashed' variant='destructive'>
          <AlertTriangle />
          <AlertTitle>{t('errors.load')}</AlertTitle>
          <AlertDescription>
            <p>{state.message}</p>
            <Button
              className='mt-2'
              onClick={reload}
              size='sm'
              type='button'
              variant='outline'
            >
              {t('actions.retry')}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {state.status === 'ready' ? (
        <AuditReady
          data={state.data}
          filtered={filtered}
          filters={filters}
          onFiltersChange={setFilters}
        />
      ) : null}
    </div>
  );
};

export default AuditPage;
