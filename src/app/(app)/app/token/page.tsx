'use client';

import { BookOpen } from 'lucide-react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { KarbLegalNote, KarbNotLive } from '@/components/app/carb-shared';
import { PageHeader } from '@/components/app/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useStakePosition,
  useStakingParams,
  useTokenAccount,
  useTokenInfo,
} from '@/hooks/use-carb-data';
import { CARB } from '@/lib/carb';
import { useT } from '@/lib/i18n';
import { ExternalTokenCard } from './_components/external-token-card';
import { PositionCard } from './_components/position-card';
import { StakeActions } from './_components/stake-actions';
import { TierTable } from './_components/tier-table';
import { TokenStats } from './_components/token-stats';
import { VotingPower } from './_components/voting-power';
import { messages } from './_messages';

const UtilityCard = () => {
  const t = useT(messages);
  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle>{t('utility.title')}</CardTitle>
      </CardHeader>
      <CardContent className='space-y-3 text-sm'>
        <ul className='list-disc space-y-2 pl-5'>
          <li>{t('utility.fees')}</li>
          <li>{t('utility.bond')}</li>
          <li>{t('utility.governance')}</li>
        </ul>
        <p className='text-muted-foreground'>{t('utility.not')}</p>
        <div className='flex flex-wrap gap-2'>
          <Button asChild variant='outline'>
            <Link href='/docs/token'>{t('utility.docs')}</Link>
          </Button>
          <Button asChild variant='outline'>
            <Link href='/app/governance'>{t('utility.governanceLink')}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

const TokenPage = () => {
  const t = useT(messages);
  const { address } = useAccount();
  const info = useTokenInfo();
  const account = useTokenAccount(address);
  const params = useStakingParams();
  const position = useStakePosition(address);

  const header = (
    <PageHeader
      actions={
        <Button asChild variant='outline'>
          <Link href='/docs/token'>
            <BookOpen />
            {t('page.docs')}
          </Link>
        </Button>
      }
      description={t('page.description')}
      title={t('page.title')}
    />
  );

  if (!CARB.token) {
    return (
      <div className='space-y-6'>
        {header}
        <KarbNotLive />
        <KarbLegalNote />
      </div>
    );
  }

  const symbol = info.data?.symbol ?? 'CARB';
  const decimals = info.data?.decimals;
  const readFailed = info.isError || account.isError || position.isError;

  return (
    <div className='space-y-6'>
      {header}

      <KarbLegalNote />

      {readFailed ? (
        <p className='text-destructive text-sm' role='alert'>
          {t('read.failed')}
        </p>
      ) : null}

      <TokenStats
        account={account}
        connected={Boolean(address)}
        info={info}
        position={position}
      />

      {info.data ? (
        <ExternalTokenCard decimals={info.data.decimals} symbol={symbol} />
      ) : null}

      {decimals === undefined ? (
        <p className='text-muted-foreground text-sm'>{t('stat.loading')}</p>
      ) : (
        <>
          {CARB.staking ? (
            <>
              <div className='grid items-start gap-6 lg:grid-cols-2'>
                <StakeActions
                  account={address}
                  balance={account.data?.balance ?? 0n}
                  decimals={decimals}
                  params={params.data}
                  position={position.data}
                  symbol={symbol}
                />
                {position.data && params.data ? (
                  <PositionCard
                    decimals={decimals}
                    params={params.data}
                    position={position.data}
                    symbol={symbol}
                  />
                ) : null}
              </div>
              <TierTable
                currentTier={position.data?.tier}
                decimals={decimals}
                failed={params.isError}
                loading={params.isLoading}
                params={params.data}
                symbol={symbol}
              />
            </>
          ) : (
            <p className='border border-dashed p-3 text-muted-foreground text-sm'>
              {t('staking.missing')}
            </p>
          )}
          <VotingPower
            account={address}
            data={account.data}
            decimals={decimals}
            symbol={symbol}
          />
        </>
      )}

      <UtilityCard />
    </div>
  );
};

export default TokenPage;
