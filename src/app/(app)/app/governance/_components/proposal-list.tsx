'use client';

import type { Address } from 'viem';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTokenInfo } from '@/hooks/use-carb-data';
import { useT } from '@/lib/i18n';
import { useProposals } from '../_lib/use-governance-data';
import { messages } from '../_messages';
import { ProposalCard } from './proposal-card';

export const ProposalList = ({ account }: { account: Address | undefined }) => {
  const t = useT(messages);
  const proposals = useProposals(account);
  const info = useTokenInfo();
  const symbol = info.data?.symbol ?? 'CARB';
  const decimals = info.data?.decimals;

  const renderBody = () => {
    if (proposals.isLoading) {
      return <Skeleton className='h-40 w-full' />;
    }
    if (proposals.isError || !proposals.data) {
      return (
        <p className='text-destructive text-sm' role='alert'>
          {t('list.failed')}
        </p>
      );
    }
    if (decimals === undefined) {
      return info.isError ? (
        <p className='text-destructive text-sm' role='alert'>
          {t('list.failed')}
        </p>
      ) : (
        <Skeleton className='h-40 w-full' />
      );
    }
    const { data } = proposals;
    if (data.proposals.length === 0) {
      return <p className='text-muted-foreground text-sm'>{t('list.empty')}</p>;
    }
    return (
      <div className='space-y-4'>
        {data.fullHistory ? null : (
          <p className='border border-amber-500/40 border-dashed p-3 text-amber-800 text-xs dark:text-amber-200'>
            {t('list.partial')}
          </p>
        )}
        {data.total > data.proposals.length ? (
          <p className='text-muted-foreground text-xs'>
            {t('list.more', {
              shown: data.proposals.length,
              total: data.total,
            })}
          </p>
        ) : null}
        <ul className='space-y-4'>
          {data.proposals.map((proposal) => (
            <li key={proposal.id.toString()}>
              <ProposalCard
                account={account}
                decimals={decimals}
                proposal={proposal}
                symbol={symbol}
              />
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle>{t('list.title')}</CardTitle>
        <CardDescription>{t('list.description')}</CardDescription>
      </CardHeader>
      <CardContent>{renderBody()}</CardContent>
    </Card>
  );
};
