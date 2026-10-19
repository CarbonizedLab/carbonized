'use client';

import { Download, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  type EmissionRecord,
  formatMonth,
  formatNumber,
  getFactor,
  SCOPES,
} from '@/lib/emissions-tracker';
import { useLocaleStore, useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { messages } from '../_messages';

interface RecordsTableProps {
  records: EmissionRecord[];
  onDelete: (id: string) => void;
  onExport: () => void;
}

const ALL = 'all';
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const KG_PER_TONNE = 1000;

const SCOPE_BADGE = {
  1: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  2: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  3: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
} as const;

export const RecordsTable = ({
  records,
  onDelete,
  onExport,
}: RecordsTableProps) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);
  const [monthFilter, setMonthFilter] = useState(ALL);
  const [scopeFilter, setScopeFilter] = useState(ALL);

  const visible = records
    .filter(
      (record) =>
        (monthFilter === ALL || record.month === Number(monthFilter)) &&
        (scopeFilter === ALL ||
          getFactor(record.factorId)?.scope === Number(scopeFilter))
    )
    .sort((a, b) => b.month - a.month || b.createdAt - a.createdAt);
  const visibleKg = visible.reduce((sum, record) => sum + record.kgCo2e, 0);

  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader className='gap-3'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <CardTitle>{t('table.title')}</CardTitle>
          <div className='flex flex-wrap items-center gap-2'>
            <Select onValueChange={setMonthFilter} value={monthFilter}>
              <SelectTrigger
                aria-label={t('table.filterMonth')}
                className='w-36'
                size='sm'
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('table.allMonths')}</SelectItem>
                {MONTHS.map((month) => (
                  <SelectItem key={month} value={String(month)}>
                    {formatMonth(month, locale, 'long')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select onValueChange={setScopeFilter} value={scopeFilter}>
              <SelectTrigger
                aria-label={t('table.filterScope')}
                className='w-36'
                size='sm'
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('table.allScopes')}</SelectItem>
                {SCOPES.map((scope) => (
                  <SelectItem key={scope} value={String(scope)}>
                    {t(`scope.${scope}.short`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              disabled={records.length === 0}
              onClick={onExport}
              size='sm'
              type='button'
              variant='outline'
            >
              <Download />
              {t('table.export')}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <p className='py-10 text-center text-muted-foreground text-sm'>
            {records.length === 0 ? t('table.empty') : t('table.noMatch')}
          </p>
        ) : (
          <div className='max-h-[28rem] overflow-auto border border-dashed'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('table.month')}</TableHead>
                  <TableHead>{t('table.scope')}</TableHead>
                  <TableHead>{t('table.category')}</TableHead>
                  <TableHead className='text-right'>
                    {t('table.quantity')}
                  </TableHead>
                  <TableHead className='text-right'>
                    {t('table.factor')}
                  </TableHead>
                  <TableHead className='text-right'>
                    {t('table.tco2e')}
                  </TableHead>
                  <TableHead>{t('table.note')}</TableHead>
                  <TableHead className='w-12'>
                    <span className='sr-only'>{t('table.actions')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((record) => {
                  const definition = getFactor(record.factorId);
                  const scope = definition?.scope ?? 1;
                  return (
                    <TableRow key={record.id}>
                      <TableCell className='whitespace-nowrap'>
                        {formatMonth(record.month, locale)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            'border-transparent',
                            SCOPE_BADGE[scope]
                          )}
                        >
                          {t(`scope.${scope}.short`)}
                        </Badge>
                      </TableCell>
                      <TableCell>{t(`factor.${record.factorId}`)}</TableCell>
                      <TableCell className='whitespace-nowrap text-right tabular-nums'>
                        {formatNumber(record.quantity, locale, 3)}{' '}
                        <span className='text-muted-foreground text-xs'>
                          {definition ? t(`unit.${definition.unit}`) : ''}
                        </span>
                      </TableCell>
                      <TableCell className='text-right text-muted-foreground tabular-nums'>
                        {formatNumber(record.factor, locale, 4)}
                      </TableCell>
                      <TableCell className='text-right font-medium tabular-nums'>
                        {formatNumber(record.kgCo2e / KG_PER_TONNE, locale, 4)}
                      </TableCell>
                      <TableCell className='max-w-48 truncate text-muted-foreground'>
                        {record.note || '—'}
                      </TableCell>
                      <TableCell>
                        <Button
                          aria-label={t('table.delete')}
                          onClick={() => onDelete(record.id)}
                          size='icon'
                          type='button'
                          variant='ghost'
                        >
                          <Trash2 className='text-destructive' />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={5}>
                    {t('table.footer', { count: visible.length })}
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {formatNumber(visibleKg / KG_PER_TONNE, locale, 4)}
                  </TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
