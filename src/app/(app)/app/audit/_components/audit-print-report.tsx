'use client';

import { PrintPortal } from '@/components/app/print-portal';
import { CONTRACTS } from '@/config/contracts';
import { formatAddress } from '@/lib/carb-format';
import { formatChainDate } from '@/lib/chain-format';
import { EXPLORER_BASE_URL } from '@/lib/explorer';
import { useLocaleStore, useT } from '@/lib/i18n';
import type { ChainEvent } from '@/lib/onchain-events';
import { describeEvent } from '../_lib/describe';
import { formatCheckDelta, formatCheckValue } from '../_lib/format-check';
import type { AuditData } from '../_lib/use-audit-data';
import { messages } from '../_messages';

/** Print rows cap so a "Save as PDF" of a busy chain stays a readable document. */
export const PRINT_LEDGER_LIMIT = 250;

const CELL = 'border border-neutral-400 px-1.5 py-1 align-top';
const HEAD = `${CELL} bg-neutral-100 text-left font-semibold`;

interface AuditPrintReportProps {
  data: AuditData;
  /** Ledger rows after the user's filters. */
  events: ChainEvent[];
}

export const AuditPrintReport = ({ data, events }: AuditPrintReportProps) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);
  const rows = events.slice(0, PRINT_LEDGER_LIMIT);
  const passed = data.checks.filter((check) => check.passed).length;
  const contracts: [string, string][] = [
    ['CarbonCreditNFT', CONTRACTS.carbonCreditNFT],
    ['CarbonCreditToken', CONTRACTS.carbonCreditToken],
    ['CarbonMarketplace', CONTRACTS.carbonMarketplace],
  ];

  return (
    <PrintPortal>
      <div className='space-y-4 bg-white text-[11px] text-neutral-900 leading-snug'>
        <header className='border-neutral-900 border-b-2 pb-2'>
          <h1 className='font-bold text-xl'>{t('print.title')}</h1>
          <p>
            {t('print.generated', {
              date: new Date(data.loadedAt).toLocaleString(
                locale === 'zh' ? 'zh-CN' : 'en-US'
              ),
            })}
          </p>
          <p>
            {t('print.network')} ·{' '}
            {t('print.window', {
              from: data.fromBlock.toString(),
              to: data.latestBlock.toString(),
            })}
          </p>
          {data.coversDeployment ? null : (
            <p className='font-semibold'>{t('print.truncated')}</p>
          )}
        </header>

        <section>
          <h2 className='mb-1 font-semibold text-sm'>{t('print.contracts')}</h2>
          <ul className='font-mono'>
            {contracts.map(([name, address]) => (
              <li key={name}>
                {name}: {address}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className='mb-1 font-semibold text-sm'>
            {t('recon.title')} —{' '}
            {t('recon.summary', { ok: passed, total: data.checks.length })}
          </h2>
          <table className='w-full border-collapse'>
            <thead>
              <tr>
                <th className={HEAD}>{t('recon.check')}</th>
                <th className={`${HEAD} text-right`}>{t('recon.expected')}</th>
                <th className={`${HEAD} text-right`}>{t('recon.actual')}</th>
                <th className={`${HEAD} text-right`}>{t('recon.delta')}</th>
                <th className={HEAD}>{t('recon.status')}</th>
              </tr>
            </thead>
            <tbody>
              {data.checks.map((check) => (
                <tr key={`${check.id}-${check.subject ?? ''}`}>
                  <td className={CELL}>
                    {t(`check.${check.id}`, { subject: check.subject ?? '' })}
                  </td>
                  <td className={`${CELL} text-right font-mono`}>
                    {formatCheckValue(check.expected, check.unit, locale)}
                  </td>
                  <td className={`${CELL} text-right font-mono`}>
                    {formatCheckValue(check.actual, check.unit, locale)}
                  </td>
                  <td className={`${CELL} text-right font-mono`}>
                    {formatCheckDelta(check.delta, check.unit, locale)}
                  </td>
                  <td className={`${CELL} font-semibold`}>
                    {check.passed ? t('status.match') : t('status.mismatch')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2 className='mb-1 font-semibold text-sm'>
            {t('ledger.title')} ({events.length})
          </h2>
          <table className='w-full border-collapse'>
            <thead>
              <tr>
                <th className={HEAD}>{t('ledger.time')}</th>
                <th className={HEAD}>{t('ledger.kind')}</th>
                <th className={HEAD}>{t('ledger.actorCol')}</th>
                <th className={HEAD}>{t('ledger.details')}</th>
                <th className={HEAD}>{t('ledger.block')}</th>
                <th className={HEAD}>{t('ledger.tx')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((event) => (
                <tr key={`${event.txHash}-${event.logIndex}`}>
                  <td className={CELL}>
                    {formatChainDate(event.timestamp, locale) || '—'}
                  </td>
                  <td className={CELL}>{t(`kind.${event.kind}`)}</td>
                  <td className={`${CELL} font-mono`}>
                    {event.actor ? formatAddress(event.actor, 4) : '—'}
                  </td>
                  <td className={CELL}>{describeEvent(event, t, locale)}</td>
                  <td className={`${CELL} font-mono`}>
                    {event.blockNumber.toString()}
                  </td>
                  <td className={`${CELL} font-mono`}>
                    {formatAddress(event.txHash, 6)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {events.length > rows.length ? (
            <p className='mt-1 italic'>
              {t('print.capped', { shown: rows.length, total: events.length })}
            </p>
          ) : null}
        </section>

        <footer className='border-neutral-400 border-t pt-2 text-neutral-600'>
          {t('print.footer', { explorer: EXPLORER_BASE_URL })}
        </footer>
      </div>
    </PrintPortal>
  );
};
