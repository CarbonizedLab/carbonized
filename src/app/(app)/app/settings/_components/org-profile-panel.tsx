'use client';

import { Building2, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { EmptyState } from '@/components/app/empty-state';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatAddress } from '@/lib/carb-format';
import { formatChainDate, formatDecimal } from '@/lib/chain-format';
import { type Locale, useLocaleStore, useT } from '@/lib/i18n';
import type { OnchainCompany, OnchainTrader } from '@/lib/registry';
import type { RegistryProfileState } from '../_lib/use-registry-profile';
import { messages } from '../_messages';

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className='min-w-0'>
    <dt className='text-muted-foreground text-xs'>{label}</dt>
    <dd className='break-words font-medium text-sm'>{children || '—'}</dd>
  </div>
);

const CompanyFields = ({
  company,
  locale,
}: {
  company: OnchainCompany;
  locale: Locale;
}) => {
  const t = useT(messages);
  const tonnes = (value: number) => `${formatDecimal(value, locale)} t`;
  return (
    <dl className='grid gap-4 sm:grid-cols-2'>
      <Field label={t('org.name')}>{company.name}</Field>
      <Field label={t('org.legalId')}>{company.legalId}</Field>
      <Field label={t('org.contactHash')}>
        <span className='font-mono text-xs'>
          {formatAddress(company.contactHash, 8)}
        </span>
        <span className='block font-normal text-muted-foreground text-xs'>
          {t('org.contactHashHint')}
        </span>
      </Field>
      <Field label={t('org.scope1')}>{tonnes(company.scope1)}</Field>
      <Field label={t('org.scope2')}>{tonnes(company.scope2)}</Field>
      <Field label={t('org.scope3')}>{tonnes(company.scope3)}</Field>
      <Field label={t('org.target')}>{tonnes(company.target)}</Field>
      <Field label={t('org.registeredAt')}>
        {formatChainDate(company.registeredAt, locale)}
      </Field>
      <Field label={t('org.updatedAt')}>
        {formatChainDate(company.updatedAt, locale)}
      </Field>
    </dl>
  );
};

const TraderFields = ({
  trader,
  locale,
}: {
  trader: OnchainTrader;
  locale: Locale;
}) => {
  const t = useT(messages);
  return (
    <dl className='grid gap-4 sm:grid-cols-2'>
      <Field label={t('org.name')}>{trader.name}</Field>
      <Field label={t('org.contactHash')}>
        <span className='font-mono text-xs'>
          {formatAddress(trader.contactHash, 8)}
        </span>
        <span className='block font-normal text-muted-foreground text-xs'>
          {t('org.contactHashHint')}
        </span>
      </Field>
      <Field label={t('org.country')}>{trader.country}</Field>
      <Field label={t('org.registeredAt')}>
        {formatChainDate(trader.registrationDate, locale)}
      </Field>
      <Field label={t('org.status')}>
        {trader.isActive ? t('org.active') : t('org.inactive')}
      </Field>
    </dl>
  );
};

const ProfileBody = ({ state }: { state: RegistryProfileState }) => {
  const t = useT(messages);
  const locale = useLocaleStore((s) => s.locale);

  if (state.status === 'loading') {
    return (
      <div aria-busy='true' className='space-y-3'>
        <Skeleton className='h-5 w-1/2' />
        <Skeleton className='h-5 w-2/3' />
        <Skeleton className='h-5 w-1/3' />
      </div>
    );
  }
  if (state.status === 'unconfigured') {
    return (
      <EmptyState
        description={t('org.unconfiguredDescription')}
        icon={<ShieldAlert className='size-10' />}
        title={t('org.unconfigured')}
      />
    );
  }
  if (state.status === 'error') {
    return (
      <Alert className='rounded-none border-dashed' variant='destructive'>
        <ShieldAlert />
        <AlertTitle>{t('org.error')}</AlertTitle>
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    );
  }
  const { registration, company, trader } = state.profile;
  if (registration === 'company' && company) {
    return (
      <div className='space-y-4'>
        <CompanyFields company={company} locale={locale} />
        <div className='flex flex-wrap gap-2'>
          <Button asChild size='sm' variant='outline'>
            <Link href='/app/company/register'>{t('org.editCompany')}</Link>
          </Button>
          <Button asChild size='sm' variant='outline'>
            <Link href='/app/company/dashboard'>{t('org.openCompany')}</Link>
          </Button>
        </div>
      </div>
    );
  }
  if (registration === 'trader' && trader) {
    return (
      <div className='space-y-4'>
        <TraderFields locale={locale} trader={trader} />
        <Button asChild size='sm' variant='outline'>
          <Link href='/app/trader/dashboard'>{t('org.openTrader')}</Link>
        </Button>
      </div>
    );
  }
  return (
    <EmptyState
      action={
        <div className='flex flex-wrap justify-center gap-2'>
          <Button asChild>
            <Link href='/app/company/register'>{t('org.registerCompany')}</Link>
          </Button>
          <Button asChild variant='outline'>
            <Link href='/app/trader/register'>{t('org.registerTrader')}</Link>
          </Button>
        </div>
      }
      description={t('org.noneDescription')}
      icon={<Building2 className='size-10' />}
      title={t('org.none')}
    />
  );
};

/** Organization profile as stored in the onchain CarbonRegistry. */
export const OrgProfilePanel = ({ state }: { state: RegistryProfileState }) => {
  const t = useT(messages);
  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle>{t('org.title')}</CardTitle>
        <CardDescription>{t('org.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ProfileBody state={state} />
      </CardContent>
    </Card>
  );
};
