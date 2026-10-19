'use client';

import { ExternalLink, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import type { Address } from 'viem';
import { formatUnits } from 'viem';
import { EmptyState } from '@/components/app/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatAddress } from '@/lib/carb-format';
import { formatChainDate } from '@/lib/chain-format';
import { explorerAddressUrl, explorerTxUrl } from '@/lib/explorer';
import { useLocaleStore, useT } from '@/lib/i18n';
import { RECENT_ISSUANCE_LIMIT } from '../_lib/issuer-chain';
import { isValidRecipient } from '../_lib/issuer-utils';
import { useIssuedCredits } from '../_lib/use-issuer-data';
import { messages } from '../_messages';
import { Field } from './field';

const TONNE_DECIMALS = 18;

const AddressLink = ({ address }: { address: string }) => (
  <a
    className='inline-flex items-center gap-1 font-mono text-xs underline-offset-2 hover:underline'
    href={explorerAddressUrl(address)}
    rel='noopener noreferrer'
    target='_blank'
    title={address}
  >
    {formatAddress(address)}
  </a>
);

export const RecentIssuance = ({
  account,
}: {
  account: Address | undefined;
}) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);
  const [filter, setFilter] = useState('');
  const value = filter.trim();
  const filterInvalid = value !== '' && !isValidRecipient(value);
  const query = useIssuedCredits(
    value !== '' && isValidRecipient(value) ? value : undefined
  );

  const renderBody = () => {
    if (filterInvalid) {
      return null;
    }
    if (query.isLoading) {
      return <Skeleton className='h-40 w-full' />;
    }
    if (query.isError) {
      return (
        <p className='text-destructive text-sm' role='alert'>
          {t('recent.error')}
        </p>
      );
    }
    const data = query.data;
    if (!data || data.credits.length === 0) {
      return (
        <EmptyState
          description={t('recent.emptyDesc')}
          title={t('recent.empty')}
        />
      );
    }
    return (
      <>
        <div className='overflow-auto border border-dashed'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('recent.col.token')}</TableHead>
                <TableHead>{t('recent.col.project')}</TableHead>
                <TableHead>{t('f.serial')}</TableHead>
                <TableHead>{t('f.methodology')}</TableHead>
                <TableHead className='text-right'>{t('f.tonnes')}</TableHead>
                <TableHead>{t('f.vintage')}</TableHead>
                <TableHead>{t('recent.col.recipient')}</TableHead>
                <TableHead>{t('recent.col.issuer')}</TableHead>
                <TableHead>{t('recent.col.date')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.credits.map((credit) => (
                <TableRow key={`${credit.txHash}-${credit.logIndex}`}>
                  <TableCell className='tabular-nums'>
                    #{credit.tokenId.toString()}
                  </TableCell>
                  <TableCell>
                    <span className='block font-medium'>
                      {credit.projectName}
                    </span>
                    <span className='block text-muted-foreground text-xs'>
                      {credit.projectId}
                    </span>
                  </TableCell>
                  <TableCell className='font-mono text-xs'>
                    {credit.serialNumber}
                  </TableCell>
                  <TableCell>
                    <span className='block'>{credit.methodology}</span>
                    <span className='flex flex-wrap gap-1'>
                      {credit.batchSize ? (
                        <Badge className='rounded-none' variant='outline'>
                          {t('recent.batch', { count: credit.batchSize })}
                        </Badge>
                      ) : null}
                      {credit.isRetired ? (
                        <Badge className='rounded-none' variant='outline'>
                          {t('recent.retired')}
                        </Badge>
                      ) : null}
                      {credit.hasProof ? null : (
                        <Badge
                          className='rounded-none border-amber-500/40 text-amber-700 dark:text-amber-300'
                          variant='outline'
                        >
                          {t('recent.noProof')}
                        </Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {Number(
                      formatUnits(credit.tonnes, TONNE_DECIMALS)
                    ).toLocaleString('en-US')}
                  </TableCell>
                  <TableCell className='tabular-nums'>
                    {credit.vintageYear}
                  </TableCell>
                  <TableCell>
                    <AddressLink address={credit.recipient} />
                  </TableCell>
                  <TableCell>
                    <AddressLink address={credit.issuer} />
                  </TableCell>
                  <TableCell className='whitespace-nowrap text-xs'>
                    <a
                      className='inline-flex items-center gap-1 underline-offset-2 hover:underline'
                      href={explorerTxUrl(credit.txHash)}
                      rel='noopener noreferrer'
                      target='_blank'
                    >
                      {formatChainDate(credit.issuedAt, locale, false)}
                      <ExternalLink className='size-3' />
                    </a>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <p className='text-muted-foreground text-xs'>
          {t('recent.showing', {
            shown: data.credits.length,
            total: data.total,
            limit: RECENT_ISSUANCE_LIMIT,
          })}
          {data.fullHistory ? '' : ` ${t('recent.partialHistory')}`}
        </p>
      </>
    );
  };

  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle>{t('recent.title')}</CardTitle>
        <CardDescription>{t('recent.description')}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='flex flex-wrap items-end gap-2'>
          <div className='min-w-64 flex-1'>
            <Field
              error={filterInvalid ? t('err.address') : undefined}
              id='recent-filter'
              label={t('recent.filter')}
            >
              <Input
                aria-describedby='recent-filter-note'
                aria-invalid={filterInvalid}
                autoComplete='off'
                className='font-mono'
                id='recent-filter'
                onChange={(event) => setFilter(event.target.value)}
                placeholder='0x…'
                spellCheck={false}
                value={filter}
              />
            </Field>
          </div>
          <Button
            disabled={!account}
            onClick={() => account && setFilter(account)}
            type='button'
            variant='outline'
          >
            {t('recent.mine')}
          </Button>
          <Button
            disabled={filter === ''}
            onClick={() => setFilter('')}
            type='button'
            variant='ghost'
          >
            {t('recent.clear')}
          </Button>
          <Button
            aria-label={t('recent.refresh')}
            disabled={query.isFetching}
            onClick={() => query.refetch()}
            size='icon'
            type='button'
            variant='outline'
          >
            <RefreshCw className={query.isFetching ? 'animate-spin' : ''} />
          </Button>
        </div>
        {renderBody()}
      </CardContent>
    </Card>
  );
};
