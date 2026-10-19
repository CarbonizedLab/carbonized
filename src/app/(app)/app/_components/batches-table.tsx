'use client';

import { Coins, Flame, Layers, PackageCheck, Tag } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/app/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { WalletButton } from '@/components/web3/wallet-button';
import { useT } from '@/lib/i18n';
import type { CarbonCredit } from '@/types/carb';
import { useFormatters } from '../_lib/use-formatters';
import { messages } from '../_messages';

interface BatchesTableProps {
  isLoading: boolean;
  isConnected: boolean;
  /** Unretired NFT credits owned by the wallet (wrapped credits are held by the CCT contract). */
  credits: CarbonCredit[];
}

const MAX_ROWS = 8;
const SKELETON_KEYS = ['a', 'b', 'c'] as const;

const BatchRow = ({ credit }: { credit: CarbonCredit }) => {
  const t = useT(messages);
  const { tonnes } = useFormatters();
  return (
    <TableRow>
      <TableCell className='font-mono text-xs'>#{credit.tokenId}</TableCell>
      <TableCell>
        <p className='max-w-[14rem] truncate font-medium text-sm'>
          {credit.projectName}
        </p>
        <p className='text-muted-foreground text-xs'>
          {credit.geography} · {credit.vintageYear}
        </p>
      </TableCell>
      <TableCell>
        <Badge variant='outline'>
          {t(`methodology.${credit.methodology}`)}
        </Badge>
      </TableCell>
      <TableCell className='text-right font-semibold'>
        {tonnes(credit.co2Tonnes)}
      </TableCell>
      <TableCell>
        <Badge className='text-amber-600 dark:text-amber-400' variant='outline'>
          {t('batches.status')}
        </Badge>
      </TableCell>
      <TableCell>
        <div className='flex justify-end gap-1.5'>
          <Button asChild size='sm' variant='outline'>
            <Link href='/app/tokenize'>
              <Layers />
              {t('batches.wrap')}
            </Link>
          </Button>
          <Button asChild size='sm' variant='outline'>
            <Link href='/app/sell-credits'>
              <Tag />
              {t('batches.sell')}
            </Link>
          </Button>
          <Button asChild size='sm'>
            <Link href='/app/carbon-wallet'>
              <Flame />
              {t('batches.retire')}
            </Link>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
};

const BatchesBody = ({
  isConnected,
  credits,
}: Omit<BatchesTableProps, 'isLoading'>) => {
  const t = useT(messages);

  if (!isConnected) {
    return (
      <EmptyState
        action={<WalletButton />}
        description={t('batches.connect.desc')}
        icon={<Coins className='size-8' />}
        title={t('batches.connect.title')}
      />
    );
  }
  if (credits.length === 0) {
    return (
      <EmptyState
        action={
          <Button asChild size='sm'>
            <Link href='/app/credit-requests'>{t('batches.empty.action')}</Link>
          </Button>
        }
        description={t('batches.empty.desc')}
        icon={<PackageCheck className='size-8' />}
        title={t('batches.empty.title')}
      />
    );
  }

  const rows = credits.slice(0, MAX_ROWS);
  return (
    <div className='space-y-3'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('batches.col.token')}</TableHead>
            <TableHead>{t('batches.col.project')}</TableHead>
            <TableHead>{t('batches.col.methodology')}</TableHead>
            <TableHead className='text-right'>
              {t('batches.col.tonnes')}
            </TableHead>
            <TableHead>{t('batches.col.status')}</TableHead>
            <TableHead className='text-right'>
              {t('batches.col.actions')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((credit) => (
            <BatchRow credit={credit} key={credit.id} />
          ))}
        </TableBody>
      </Table>
      {credits.length > MAX_ROWS ? (
        <p className='text-center text-muted-foreground text-xs'>
          {t('batches.more', { count: credits.length - MAX_ROWS })}{' '}
          <Link
            className='text-primary hover:underline'
            href='/app/carbon-wallet'
          >
            {t('batches.viewAll')}
          </Link>
        </p>
      ) : null}
    </div>
  );
};

export const BatchesTable = ({ isLoading, ...body }: BatchesTableProps) => {
  const t = useT(messages);
  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader className='flex flex-row items-start justify-between gap-2'>
        <div className='space-y-1'>
          <CardTitle className='flex items-center gap-2 text-lg'>
            <PackageCheck className='size-5 text-primary' />
            {t('batches.title')}
          </CardTitle>
          <p className='text-muted-foreground text-xs'>{t('batches.desc')}</p>
        </div>
        {body.isConnected && !isLoading ? (
          <Badge variant='secondary'>
            {t('batches.count', { count: body.credits.length })}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className='space-y-3'>
            {SKELETON_KEYS.map((key) => (
              <Skeleton className='h-12 w-full rounded-none' key={key} />
            ))}
          </div>
        ) : (
          <BatchesBody {...body} />
        )}
      </CardContent>
    </Card>
  );
};
