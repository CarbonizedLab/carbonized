'use client';

import { Blocks, Receipt, ScanSearch, ShieldCheck } from 'lucide-react';
import { StatCard } from '@/components/app/stat-card';
import { formatChainDate } from '@/lib/chain-format';
import { useLocaleStore, useT } from '@/lib/i18n';
import type { AuditData } from '../_lib/use-audit-data';
import { messages } from '../_messages';

export const AuditKpis = ({ data }: { data: AuditData }) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);

  const txCount = new Set(data.events.map((event) => event.txHash)).size;
  // Events are sorted newest first.
  const lastEvent = data.events[0];
  const passed = data.checks.filter((check) => check.passed).length;
  const allPassed = data.checks.length > 0 && passed === data.checks.length;

  return (
    <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
      <StatCard
        icon={<Receipt className='size-4' />}
        label={t('kpi.transactions')}
        subtext={t('kpi.transactionsHint', { events: data.events.length })}
        value={txCount.toLocaleString()}
      />
      <StatCard
        icon={<Blocks className='size-4' />}
        label={t('kpi.finality')}
        subtext={t('kpi.finalityHint', { from: data.fromBlock.toString() })}
        value={`#${data.latestBlock.toLocaleString()}`}
      />
      <StatCard
        icon={<ScanSearch className='size-4' />}
        label={t('kpi.lastActivity')}
        subtext={
          lastEvent
            ? formatChainDate(lastEvent.timestamp, locale)
            : t('kpi.noActivity')
        }
        value={lastEvent ? `#${lastEvent.blockNumber.toLocaleString()}` : '—'}
      />
      <StatCard
        icon={<ShieldCheck className='size-4' />}
        label={t('kpi.reconciliation')}
        subtext={
          data.checks.length === 0
            ? t('kpi.noChecks')
            : t('kpi.reconciliationHint', {
                ok: passed,
                total: data.checks.length,
              })
        }
        value={
          allPassed ? t('status.match') : `${passed}/${data.checks.length}`
        }
      />
    </div>
  );
};
