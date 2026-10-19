'use client';

import { ExternalLink } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CARB } from '@/lib/carb';
import { explorerAddressUrl } from '@/lib/explorer';
import { useT } from '@/lib/i18n';
import { messages } from '../_messages';

interface ExternalTokenCardProps {
  symbol: string;
  decimals: number;
}

/** Info line shown only when CARB is a token launched outside Carbonized (for example through a launchpad). */
export const ExternalTokenCard = ({
  symbol,
  decimals,
}: ExternalTokenCardProps) => {
  const t = useT(messages);
  if (!(CARB.external && CARB.token)) {
    return null;
  }
  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle>{t('ext.title')}</CardTitle>
        <CardDescription>{t('ext.body', { symbol })}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-2 text-sm'>
        <dl className='grid gap-3 sm:grid-cols-3'>
          <div>
            <dt className='text-muted-foreground text-xs'>{t('ext.symbol')}</dt>
            <dd className='font-semibold'>{symbol}</dd>
          </div>
          <div>
            <dt className='text-muted-foreground text-xs'>
              {t('ext.decimals')}
            </dt>
            <dd className='font-semibold'>{decimals}</dd>
          </div>
          <div className='min-w-0'>
            <dt className='text-muted-foreground text-xs'>
              {t('ext.address')}
            </dt>
            <dd className='break-all font-mono text-xs'>{CARB.token}</dd>
          </div>
        </dl>
        <a
          className='inline-flex items-center gap-1 underline'
          href={explorerAddressUrl(CARB.token)}
          rel='noopener noreferrer'
          target='_blank'
        >
          {t('ext.explorer')}
          <ExternalLink aria-hidden='true' className='size-3' />
        </a>
        <p className='text-muted-foreground text-xs'>{t('ext.risk')}</p>
      </CardContent>
    </Card>
  );
};
