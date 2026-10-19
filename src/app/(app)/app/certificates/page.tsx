'use client';

import {
  AlertTriangle,
  Award,
  RefreshCw,
  ShieldAlert,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useAccount } from 'wagmi';
import { EmptyState } from '@/components/app/empty-state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/lib/i18n';
import { isTxHash } from '@/lib/retirement';
import { eventKey, RetirementList } from './_components/retirement-list';
import { VerifiedCertificate } from './_components/verified-certificate';
import { VerifyByHash } from './_components/verify-by-hash';
import {
  type RetirementList as RetirementData,
  useRetirements,
} from './_lib/use-retirements';
import { messages } from './_messages';

const ListLoading = () => (
  <div className='grid gap-6 lg:grid-cols-[320px_1fr]'>
    <div className='space-y-2'>
      <Skeleton className='h-20 rounded-none' />
      <Skeleton className='h-20 rounded-none' />
      <Skeleton className='h-20 rounded-none' />
    </div>
    <Skeleton className='h-96 rounded-none' />
  </div>
);

const RetirementsView = ({ data }: { data: RetirementData }) => {
  const t = useT(messages);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  if (data.events.length === 0) {
    return (
      <div className='space-y-4'>
        {data.coversDeployment ? null : (
          <p className='text-muted-foreground text-xs'>
            {t('list.truncated', { from: data.fromBlock.toString() })}
          </p>
        )}
        <EmptyState
          action={
            <Button asChild>
              <Link href='/app/carbon-wallet?tab=nfts'>
                {t('list.emptyAction')}
              </Link>
            </Button>
          }
          description={t('list.emptyDescription')}
          icon={<Award className='size-12' />}
          title={t('list.emptyTitle')}
        />
      </div>
    );
  }

  const active =
    data.events.find((event) => eventKey(event) === selectedKey) ??
    data.events[0];
  if (!active) {
    return null;
  }

  return (
    <div className='space-y-4'>
      {data.coversDeployment ? null : (
        <Alert
          className='rounded-none border-amber-500/50 border-dashed text-amber-700 dark:text-amber-300'
          role='status'
        >
          <AlertTriangle />
          <AlertDescription>
            {t('list.truncated', { from: data.fromBlock.toString() })}
          </AlertDescription>
        </Alert>
      )}
      <div className='grid gap-6 lg:grid-cols-[320px_1fr]'>
        <RetirementList
          events={data.events}
          onSelect={setSelectedKey}
          selectedKey={eventKey(active)}
        />
        {isTxHash(active.txHash) ? (
          <VerifiedCertificate
            key={eventKey(active)}
            tokenId={active.tokenId?.toString()}
            txHash={active.txHash}
          />
        ) : null}
      </div>
    </div>
  );
};

const CertificatesPage = () => {
  const t = useT(messages);
  const { address, isConnected } = useAccount();
  const { state, reload } = useRetirements(isConnected ? address : undefined);

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
        {isConnected ? (
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
        ) : null}
      </div>

      <VerifyByHash />

      {isConnected ? null : (
        <EmptyState
          description={t('connect.description')}
          icon={<Wallet className='size-12' />}
          title={t('connect.title')}
        />
      )}
      {isConnected && state.status === 'unconfigured' ? (
        <EmptyState
          description={t('unconfigured.description')}
          icon={<ShieldAlert className='size-12' />}
          title={t('unconfigured.title')}
        />
      ) : null}
      {isConnected && state.status === 'loading' ? <ListLoading /> : null}
      {isConnected && state.status === 'error' ? (
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
      {isConnected && state.status === 'ready' ? (
        <RetirementsView data={state.data} />
      ) : null}
    </div>
  );
};

export default CertificatesPage;
