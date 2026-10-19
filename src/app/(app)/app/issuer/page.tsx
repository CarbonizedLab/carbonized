'use client';

import { useQueryClient } from '@tanstack/react-query';
import { BookOpen } from 'lucide-react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { PageHeader } from '@/components/app/page-header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CARB } from '@/lib/carb';
import { useT } from '@/lib/i18n';
import { BatchIssuance } from './_components/batch-issuance';
import { BondPanel } from './_components/bond-panel';
import {
  IssuerDirectory,
  IssuerInfoCard,
  IssuerStatusCard,
} from './_components/issuer-overview';
import { RecentIssuance } from './_components/recent-issuance';
import { RoleAdmin } from './_components/role-admin';
import { SingleIssuance } from './_components/single-issuance';
import { isNftConfigured } from './_lib/issuer-chain';
import { useNftRoles } from './_lib/use-issuer-data';
import { messages } from './_messages';

const IssuerPage = () => {
  const t = useT(messages);
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const configured = isNftConfigured();
  const roles = useNftRoles(address);
  const isIssuer = roles.data?.isIssuer === true && !roles.data.paused;

  const refreshIssued = () => {
    queryClient.invalidateQueries({ queryKey: ['nft-issued'] });
  };

  return (
    <div className='space-y-6'>
      <PageHeader
        actions={
          <Button asChild variant='outline'>
            <Link href='/docs/guides/issuer'>
              <BookOpen />
              {t('page.docs')}
            </Link>
          </Button>
        }
        description={t('page.description')}
        title={t('page.title')}
      />

      <div className='grid items-start gap-6 lg:grid-cols-2'>
        <IssuerStatusCard
          account={address}
          configured={configured}
          failed={roles.isError}
          loading={roles.isLoading}
          roles={roles.data}
        />
        <IssuerInfoCard />
      </div>

      <Card className='rounded-none border-dashed shadow-none'>
        <CardHeader>
          <CardTitle>{t('issue.title')}</CardTitle>
          <CardDescription>{t('issue.description')}</CardDescription>
        </CardHeader>
        <CardContent className='space-y-4'>
          {isIssuer ? null : (
            <p
              className='border border-amber-500/40 border-dashed p-3 text-amber-800 text-sm dark:text-amber-200'
              role='note'
            >
              {roles.data?.isIssuer
                ? t('issue.pausedNote')
                : t('issue.disabledNote')}
            </p>
          )}
          <Tabs defaultValue='single'>
            <TabsList>
              <TabsTrigger value='single'>{t('tabs.single')}</TabsTrigger>
              <TabsTrigger value='batch'>{t('tabs.batch')}</TabsTrigger>
            </TabsList>
            <TabsContent className='pt-4' value='single'>
              <SingleIssuance
                account={address}
                disabled={!isIssuer}
                onIssued={refreshIssued}
              />
            </TabsContent>
            <TabsContent className='pt-4' value='batch'>
              <BatchIssuance
                account={address}
                disabled={!isIssuer}
                onIssued={refreshIssued}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className='grid items-start gap-6 lg:grid-cols-2'>
        <IssuerDirectory account={address} />
        {roles.data?.isAdmin && address ? (
          <RoleAdmin account={address} />
        ) : null}
      </div>

      {CARB.bond ? <BondPanel account={address} /> : null}

      <RecentIssuance account={address} />
    </div>
  );
};

export default IssuerPage;
