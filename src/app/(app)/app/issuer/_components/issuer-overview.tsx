'use client';

import { BadgeCheck, BookOpen, ShieldAlert, ShieldOff } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Address } from 'viem';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CONTRACTS } from '@/config/contracts';
import { formatAddress } from '@/lib/carb-format';
import { explorerAddressUrl } from '@/lib/explorer';
import { useT } from '@/lib/i18n';
import type { NftRoles } from '../_lib/issuer-chain';
import { useIssuerList } from '../_lib/use-issuer-data';
import { messages } from '../_messages';

const DOCS_HREF = '/docs/guides/issuer';

interface StatusCardProps {
  configured: boolean;
  account: Address | undefined;
  loading: boolean;
  failed: boolean;
  roles: NftRoles | undefined;
}

const StatusLine = ({
  icon,
  tone,
  title,
  children,
}: {
  icon: ReactNode;
  tone: 'ok' | 'warn' | 'neutral';
  title: string;
  children?: ReactNode;
}) => {
  const toneClass = {
    ok: 'text-emerald-700 dark:text-emerald-300',
    warn: 'text-amber-700 dark:text-amber-300',
    neutral: 'text-foreground',
  }[tone];
  return (
    <div className='flex items-start gap-3'>
      <span aria-hidden='true' className={toneClass}>
        {icon}
      </span>
      <div className='space-y-1 text-sm'>
        <p className={`font-medium ${toneClass}`}>{title}</p>
        {children ? (
          <div className='text-muted-foreground'>{children}</div>
        ) : null}
      </div>
    </div>
  );
};

/** Role status of the connected wallet, with how-to-apply guidance for non-issuers. */
export const IssuerStatusCard = ({
  configured,
  account,
  loading,
  failed,
  roles,
}: StatusCardProps) => {
  const t = useT(messages);

  const renderStatus = () => {
    if (!configured) {
      return (
        <StatusLine
          icon={<ShieldAlert className='size-5' />}
          title={t('status.notConfigured')}
          tone='warn'
        >
          {t('status.notConfiguredDesc')}
        </StatusLine>
      );
    }
    if (!account) {
      return (
        <StatusLine
          icon={<ShieldOff className='size-5' />}
          title={t('status.notConnected')}
          tone='neutral'
        >
          {t('status.notConnectedDesc')}
        </StatusLine>
      );
    }
    if (loading) {
      return <Skeleton className='h-12 w-full' />;
    }
    if (failed || !roles) {
      return (
        <StatusLine
          icon={<ShieldAlert className='size-5' />}
          title={t('status.failed')}
          tone='warn'
        />
      );
    }
    if (roles.isIssuer) {
      return (
        <StatusLine
          icon={<BadgeCheck className='size-5' />}
          title={t('status.issuer')}
          tone='ok'
        >
          {roles.paused ? t('status.paused') : t('status.issuerDesc')}
        </StatusLine>
      );
    }
    return (
      <StatusLine
        icon={<ShieldOff className='size-5' />}
        title={t('status.notIssuer')}
        tone='neutral'
      >
        {t('status.notIssuerDesc')}
      </StatusLine>
    );
  };

  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle>{t('status.title')}</CardTitle>
        <CardDescription>
          {account ? (
            <span className='font-mono text-xs'>{account}</span>
          ) : (
            t('status.noWallet')
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {renderStatus()}
        {roles?.isAdmin ? (
          <Badge className='rounded-none' variant='outline'>
            {t('status.admin')}
          </Badge>
        ) : null}
        {roles?.isIssuer ? null : (
          <div className='space-y-2 border-t border-dashed pt-4 text-sm'>
            <p className='font-medium'>{t('apply.title')}</p>
            <ol className='list-decimal space-y-1 pl-5 text-muted-foreground'>
              <li>{t('apply.step1')}</li>
              <li>{t('apply.step2')}</li>
              <li>{t('apply.step3')}</li>
            </ol>
            <Button asChild size='sm' variant='outline'>
              <Link href={DOCS_HREF}>
                <BookOpen />
                {t('apply.docs')}
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

/** What the issuer role is and what it is not (trust model). Visible to everyone. */
export const IssuerInfoCard = () => {
  const t = useT(messages);
  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle>{t('info.title')}</CardTitle>
        <CardDescription>{t('info.description')}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4 text-sm'>
        <ul className='list-disc space-y-1.5 pl-5'>
          <li>{t('info.p1')}</li>
          <li>{t('info.p2')}</li>
          <li>{t('info.p3')}</li>
          <li>{t('info.p4')}</li>
        </ul>
        <p
          className='border border-amber-500/40 border-dashed p-3 text-amber-800 text-xs dark:text-amber-200'
          role='note'
        >
          {t('info.trust')}
        </p>
        <Button asChild size='sm' variant='outline'>
          <Link href={DOCS_HREF}>
            <BookOpen />
            {t('info.docs')}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
};

/** Public list of current NATIVE_ISSUER_ROLE holders, rebuilt from role events and confirmed with hasRole. */
export const IssuerDirectory = ({
  account,
}: {
  account: Address | undefined;
}) => {
  const t = useT(messages);
  const query = useIssuerList();

  const renderBody = () => {
    if (query.isLoading) {
      return <Skeleton className='h-20 w-full' />;
    }
    if (query.isError || !query.data) {
      return (
        <p className='text-destructive text-sm' role='alert'>
          {t('directory.error')}
        </p>
      );
    }
    if (query.data.issuers.length === 0) {
      return (
        <p className='text-muted-foreground text-sm'>{t('directory.empty')}</p>
      );
    }
    return (
      <ul className='divide-y divide-dashed border border-dashed'>
        {query.data.issuers.map((issuer) => {
          const isVerifier =
            issuer.address.toLowerCase() ===
            CONTRACTS.emissionVerifier.toLowerCase();
          const isYou = issuer.address.toLowerCase() === account?.toLowerCase();
          return (
            <li
              className='flex flex-wrap items-center justify-between gap-2 p-3 text-sm'
              key={issuer.address}
            >
              <a
                className='font-mono text-xs underline-offset-2 hover:underline'
                href={explorerAddressUrl(issuer.address)}
                rel='noopener noreferrer'
                target='_blank'
                title={issuer.address}
              >
                {formatAddress(issuer.address, 6)}
              </a>
              <span className='flex flex-wrap items-center gap-1'>
                {isVerifier ? (
                  <Badge className='rounded-none' variant='outline'>
                    {t('directory.verifier')}
                  </Badge>
                ) : null}
                {isYou ? (
                  <Badge className='rounded-none' variant='outline'>
                    {t('directory.you')}
                  </Badge>
                ) : null}
                <span className='text-muted-foreground text-xs'>
                  {t('directory.since', {
                    block: issuer.grantedBlock.toString(),
                  })}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle>{t('directory.title')}</CardTitle>
        <CardDescription>{t('directory.description')}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-3'>
        {renderBody()}
        {query.data && !query.data.fullHistory ? (
          <p className='text-muted-foreground text-xs'>
            {t('directory.partial')}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
};
