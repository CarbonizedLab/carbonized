'use client';

import { ExternalLink, Info } from 'lucide-react';
import Link from 'next/link';
import type { Hash } from 'viem';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { explorerTxUrl } from '@/lib/explorer';
import { type Messages, useT } from '@/lib/i18n';

const messages: Messages = {
  en: {
    'notLive.title': 'CARB utilities are not live yet',
    'notLive.body':
      'The CARB utility contracts (staking, bond and governance) have not been enabled on this deployment, so there is nothing to stake, bond or vote with yet. Everything else in Carbonized (trading, retirement, certificates) works without it. CARB only adds optional fee tiers, a bond for the bond-based issuer path and parameter governance.',
    'notLive.docs': 'Read about CARB',
    'legal.title': 'Utility only. Not investment advice.',
    'legal.body':
      'CARB is a utility token for protocol features. It carries no profit share, no staking rewards and no promise of returns or value. Nothing here is investment advice or an offer or solicitation, and access may be restricted in your jurisdiction. The contracts are unaudited: only use amounts you can afford to lose.',
    'tx.wrongNetwork': 'Switch your wallet to the Carbonized network first.',
    'tx.view': 'View transaction',
  },
  zh: {
    'notLive.title': 'CARB 尚未上线',
    'notLive.body':
      '此部署尚未启用 CARB 功能代币，因此暂时无法质押、缴纳保证金或投票。Carbonized 的其他功能（交易、注销、证书）无需 CARB 即可使用。CARB 仅提供可选的手续费等级、保证金签发通道以及参数治理。',
    'notLive.docs': '了解 CARB',
    'legal.title': '仅为功能代币，不构成投资建议。',
    'legal.body':
      'CARB 是用于协议功能的功能代币，不提供分红、质押奖励，也不承诺任何收益或价值。此处内容不构成投资建议、要约或招揽，且在您所在的司法辖区可能受到限制。合约尚未经过审计：请仅使用您能承受损失的金额。',
    'tx.wrongNetwork': '请先将钱包切换到 Carbonized 所在网络。',
    'tx.view': '查看交易',
  },
};

/** Shown by the token and governance pages when the CARB contracts are not configured. */
export const KarbNotLive = () => {
  const t = useT(messages);
  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle>{t('notLive.title')}</CardTitle>
        <CardDescription>{t('notLive.body')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant='outline'>
          <Link href='/docs/token'>{t('notLive.docs')}</Link>
        </Button>
      </CardContent>
    </Card>
  );
};

export const KarbLegalNote = () => {
  const t = useT(messages);
  return (
    <aside
      aria-label={t('legal.title')}
      className='flex items-start gap-2 border border-dashed p-3 text-muted-foreground text-xs'
    >
      <Info aria-hidden='true' className='mt-0.5 size-4 shrink-0' />
      <p>
        <strong className='font-semibold text-foreground'>
          {t('legal.title')}
        </strong>{' '}
        {t('legal.body')}
      </p>
    </aside>
  );
};

interface TxStatusProps {
  wrongNetwork: boolean;
  error: string | null;
  hash: Hash | null;
}

/** Wrong-network warning, last error and a link to the last transaction on the block explorer. */
export const TxStatus = ({ wrongNetwork, error, hash }: TxStatusProps) => {
  const t = useT(messages);
  return (
    <div aria-live='polite' className='space-y-1'>
      {wrongNetwork ? (
        <p className='text-amber-700 text-sm dark:text-amber-300' role='alert'>
          {t('tx.wrongNetwork')}
        </p>
      ) : null}
      {error ? (
        <p className='text-destructive text-sm' role='alert'>
          {error}
        </p>
      ) : null}
      {hash ? (
        <a
          className='inline-flex items-center gap-1 text-sm underline'
          href={explorerTxUrl(hash)}
          rel='noopener noreferrer'
          target='_blank'
        >
          {t('tx.view')}
          <ExternalLink aria-hidden='true' className='size-3' />
        </a>
      ) : null}
    </div>
  );
};
