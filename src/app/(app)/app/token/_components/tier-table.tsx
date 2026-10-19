'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { bpsToPercent, formatKarb, type StakingParams } from '@/lib/carb';
import { useLocaleStore, useT } from '@/lib/i18n';
import { messages } from '../_messages';

interface TierTableProps {
  params: StakingParams | undefined;
  loading: boolean;
  failed: boolean;
  symbol: string;
  decimals: number;
  /** Tier of the connected wallet, to highlight its row. */
  currentTier: number | undefined;
}

export const TierTable = ({
  params,
  loading,
  failed,
  symbol,
  decimals,
  currentTier,
}: TierTableProps) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);

  const renderBody = () => {
    if (loading) {
      return <Skeleton className='h-32 w-full' />;
    }
    if (failed || !params) {
      return (
        <p className='text-destructive text-sm' role='alert'>
          {t('tiers.failed')}
        </p>
      );
    }
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('tiers.tier')}</TableHead>
            <TableHead>{t('tiers.threshold')}</TableHead>
            <TableHead className='text-right'>{t('tiers.discount')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {params.tiers.map((row) => (
            <TableRow
              aria-current={row.tier === currentTier ? 'true' : undefined}
              data-state={row.tier === currentTier ? 'selected' : undefined}
              key={row.tier}
            >
              <TableCell className='font-medium'>
                {row.tier}
                {row.tier === currentTier ? (
                  <span className='ml-2 text-primary text-xs'>
                    {t('tiers.you')}
                  </span>
                ) : null}
              </TableCell>
              <TableCell>
                {row.tier === 0
                  ? t('tiers.none')
                  : `${formatKarb(row.threshold, locale, decimals)} ${symbol}`}
              </TableCell>
              <TableCell className='text-right'>
                {bpsToPercent(row.discountBps)}%
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle>{t('tiers.title')}</CardTitle>
        <CardDescription>{t('tiers.description')}</CardDescription>
      </CardHeader>
      <CardContent>{renderBody()}</CardContent>
    </Card>
  );
};
