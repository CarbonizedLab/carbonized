'use client';

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  XCircle,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { type Locale, useLocaleStore, useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { formatCheckDelta, formatCheckValue } from '../_lib/format-check';
import type { CheckGroup, ReconCheck } from '../_lib/reconcile';
import type { AuditData } from '../_lib/use-audit-data';
import { messages } from '../_messages';

const GROUPS: readonly CheckGroup[] = ['nft', 'token', 'market'] as const;

export const StatusBadge = ({ passed }: { passed: boolean }) => {
  const t = useT(messages);
  return (
    <Badge
      className={cn(
        'rounded-none',
        passed
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'border-destructive/40 bg-destructive/10 text-destructive'
      )}
      variant='outline'
    >
      {passed ? <CheckCircle2 /> : <XCircle />}
      {passed ? t('status.match') : t('status.mismatch')}
    </Badge>
  );
};

export const WindowNotice = ({ data }: { data: AuditData }) => {
  const t = useT(messages);
  const vars = {
    from: data.fromBlock.toString(),
    to: data.latestBlock.toString(),
  };
  if (data.coversDeployment) {
    return (
      <Alert className='rounded-none border-dashed'>
        <Info />
        <AlertTitle>{t('window.title')}</AlertTitle>
        <AlertDescription>{t('window.full', vars)}</AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert
      className='rounded-none border-amber-500/50 border-dashed text-amber-700 dark:text-amber-300'
      role='status'
    >
      <AlertTriangle />
      <AlertTitle>{t('window.titleTruncated')}</AlertTitle>
      <AlertDescription>{t('window.truncated', vars)}</AlertDescription>
    </Alert>
  );
};

const CheckRow = ({ check, locale }: { check: ReconCheck; locale: Locale }) => {
  const t = useT(messages);
  return (
    <TableRow>
      <TableCell className='max-w-xs whitespace-normal'>
        <p className='font-medium'>
          {t(`check.${check.id}`, { subject: check.subject ?? '' })}
        </p>
        <p className='flex flex-wrap items-center gap-x-2 text-muted-foreground text-xs'>
          <span>{t(`rule.${check.rule}`)}</span>
          {check.windowDependent ? (
            <span className='inline-flex items-center gap-1'>
              <Clock className='size-3' />
              {t('recon.windowLimited')}
            </span>
          ) : null}
        </p>
      </TableCell>
      <TableCell className='text-right font-mono tabular-nums'>
        {formatCheckValue(check.expected, check.unit, locale)}
      </TableCell>
      <TableCell className='text-right font-mono tabular-nums'>
        {formatCheckValue(check.actual, check.unit, locale)}
      </TableCell>
      <TableCell
        className={cn(
          'text-right font-mono tabular-nums',
          !check.passed && 'text-destructive'
        )}
      >
        {formatCheckDelta(check.delta, check.unit, locale)}
      </TableCell>
      <TableCell className='text-right'>
        <StatusBadge passed={check.passed} />
      </TableCell>
    </TableRow>
  );
};

const GroupTable = ({
  group,
  checks,
  locale,
}: {
  group: CheckGroup;
  checks: ReconCheck[];
  locale: Locale;
}) => {
  const t = useT(messages);
  return (
    <div className='space-y-2'>
      <h3 className='font-semibold text-sm'>{t(`group.${group}`)}</h3>
      <div className='overflow-x-auto border border-dashed'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('recon.check')}</TableHead>
              <TableHead className='text-right'>
                {t('recon.expected')}
              </TableHead>
              <TableHead className='text-right'>{t('recon.actual')}</TableHead>
              <TableHead className='text-right'>{t('recon.delta')}</TableHead>
              <TableHead className='text-right'>{t('recon.status')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {checks.map((check) => (
              <CheckRow
                check={check}
                key={`${check.id}-${check.subject ?? ''}`}
                locale={locale}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export const ReconciliationPanel = ({ data }: { data: AuditData }) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);
  const passed = data.checks.filter((check) => check.passed).length;
  const partialMarket = data.snapshot.market?.partial === true;

  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle>{t('recon.title')}</CardTitle>
        <CardDescription>{t('recon.description')}</CardDescription>
        {data.checks.length > 0 ? (
          <p
            className={cn(
              'font-semibold text-sm',
              passed === data.checks.length
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-destructive'
            )}
          >
            {t('recon.summary', { ok: passed, total: data.checks.length })}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className='space-y-5'>
        <WindowNotice data={data} />
        {partialMarket ? (
          <Alert className='rounded-none border-dashed' role='status'>
            <Info />
            <AlertDescription>{t('recon.partialMarket')}</AlertDescription>
          </Alert>
        ) : null}
        {data.checks.length === 0 ? (
          <p className='text-muted-foreground text-sm'>{t('recon.noChecks')}</p>
        ) : (
          GROUPS.map((group) => {
            const groupChecks = data.checks.filter((c) => c.group === group);
            return groupChecks.length > 0 ? (
              <GroupTable
                checks={groupChecks}
                group={group}
                key={group}
                locale={locale}
              />
            ) : null;
          })
        )}
      </CardContent>
    </Card>
  );
};
