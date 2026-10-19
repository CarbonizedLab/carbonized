'use client';

import { BookOpen } from 'lucide-react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { KarbLegalNote, KarbNotLive } from '@/components/app/carb-shared';
import { PageHeader } from '@/components/app/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTokenInfo } from '@/hooks/use-carb-data';
import { CARB, formatDuration, formatKarb } from '@/lib/carb';
import { useLocaleStore, useT } from '@/lib/i18n';
import { DelegateCard } from './_components/delegate-card';
import { ProposalList } from './_components/proposal-list';
import { ProposeForm } from './_components/propose-form';
import { useGovernorSettings } from './_lib/use-governance-data';
import { messages } from './_messages';

const SettingRow = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className='text-muted-foreground text-xs'>{label}</dt>
    <dd className='font-semibold text-sm'>{value}</dd>
  </div>
);

const GovernancePage = () => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);
  const { address } = useAccount();
  const settings = useGovernorSettings();
  const info = useTokenInfo();

  const header = (
    <PageHeader
      actions={
        <Button asChild variant='outline'>
          <Link href='/docs/token/governance'>
            <BookOpen />
            {t('page.docs')}
          </Link>
        </Button>
      }
      description={t('page.description')}
      title={t('page.title')}
    />
  );

  if (!(CARB.token && CARB.governor)) {
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

  return (
    <div className='space-y-6'>
      {header}

      <KarbLegalNote />

      <Card className='rounded-none border-dashed shadow-none'>
        <CardHeader>
          <CardTitle>{t('cfg.title')}</CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          {settings.data ? (
            <dl className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
              <SettingRow
                label={t('cfg.delay')}
                value={formatDuration(settings.data.votingDelay, locale)}
              />
              <SettingRow
                label={t('cfg.period')}
                value={formatDuration(settings.data.votingPeriod, locale)}
              />
              <SettingRow
                label={t('cfg.threshold')}
                value={
                  decimals === undefined
                    ? '—'
                    : `${formatKarb(settings.data.proposalThreshold, locale, decimals)} ${symbol}`
                }
              />
              <SettingRow
                label={t('cfg.quorum')}
                value={t(
                  CARB.votes ? 'cfg.quorumValueWrapper' : 'cfg.quorumValue',
                  { percent: settings.data.quorumPercent, symbol }
                )}
              />
            </dl>
          ) : (
            settings.isError && (
              <p className='text-destructive text-sm' role='alert'>
                {t('cfg.failed')}
              </p>
            )
          )}
          <p className='text-muted-foreground text-xs'>
            {t(CARB.votes ? 'cfg.noteWrapper' : 'cfg.note')}
          </p>
        </CardContent>
      </Card>

      <div className='grid items-start gap-6 lg:grid-cols-2'>
        <DelegateCard account={address} />
        <ProposeForm account={address} />
      </div>

      <ProposalList account={address} />
    </div>
  );
};

export default GovernancePage;
