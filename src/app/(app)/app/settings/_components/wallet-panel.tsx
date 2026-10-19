'use client';

import { AlertTriangle, Copy, ExternalLink } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { formatUnits } from 'viem';
import { useAccount, useBalance } from 'wagmi';
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
import { targetChain } from '@/config/wagmi';
import { useContractInteraction } from '@/hooks/use-contract-interaction';
import { formatDecimal } from '@/lib/chain-format';
import { explorerAddressUrl } from '@/lib/explorer';
import { useLocaleStore, useT } from '@/lib/i18n';
import { messages } from '../_messages';

const NATIVE_DIGITS = 5;
const TOKEN_DIGITS = 2;

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className='flex flex-wrap items-center justify-between gap-2 border-b border-dashed py-2 last:border-b-0'>
    <dt className='text-muted-foreground text-sm'>{label}</dt>
    <dd className='text-sm'>{children}</dd>
  </div>
);

/** Connected wallet: address, network, native + USDG balance. */
export const WalletPanel = ({ account }: { account: string }) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);
  const { chain } = useAccount();
  const { getErc20Balance } = useContractInteraction();
  const native = useBalance({ address: account as `0x${string}` });
  const [usdc, setUsdc] = useState<number | null>(null);
  const [usdcLoading, setUsdcLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setUsdcLoading(true);
    getErc20Balance(CONTRACTS.usdc, account)
      .then((value) => {
        if (!cancelled) {
          setUsdc(value);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setUsdcLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [account, getErc20Balance]);

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(account);
      toast.success(t('wallet.copied'));
    } catch {
      toast.error(t('common.copyFailed'));
    }
  };

  const wrongNetwork = chain !== undefined && chain.id !== targetChain.id;

  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle>{t('wallet.title')}</CardTitle>
        <CardDescription>{t('wallet.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {wrongNetwork ? (
          <p
            className='mb-3 flex items-center gap-2 border border-amber-500/40 border-dashed p-2 text-amber-700 text-xs dark:text-amber-300'
            role='alert'
          >
            <AlertTriangle className='size-4 shrink-0' />
            {t('wallet.wrongNetwork', { chain: String(targetChain.id) })}
          </p>
        ) : null}
        <dl>
          <Row label={t('wallet.address')}>
            <span className='flex items-center gap-1'>
              <span className='break-all font-mono text-xs'>{account}</span>
              <Button
                aria-label={t('wallet.copy')}
                onClick={copyAddress}
                size='icon'
                type='button'
                variant='ghost'
              >
                <Copy />
              </Button>
              <Button
                aria-label={t('wallet.explorer')}
                asChild
                size='icon'
                variant='ghost'
              >
                <a
                  href={explorerAddressUrl(account)}
                  rel='noopener noreferrer'
                  target='_blank'
                >
                  <ExternalLink />
                </a>
              </Button>
            </span>
          </Row>
          <Row label={t('wallet.network')}>
            <Badge className='rounded-none' variant='outline'>
              {chain
                ? `${chain.name} (${chain.id})`
                : t('wallet.unknownNetwork')}
            </Badge>
          </Row>
          <Row label={t('wallet.native')}>
            {native.isLoading ? (
              <Skeleton className='h-5 w-24' />
            ) : (
              <span className='font-mono'>
                {native.data
                  ? `${formatDecimal(Number(formatUnits(native.data.value, native.data.decimals)), locale, NATIVE_DIGITS)} ${native.data.symbol}`
                  : '—'}
              </span>
            )}
          </Row>
          <Row label={t('wallet.usdc')}>
            {usdcLoading ? (
              <Skeleton className='h-5 w-24' />
            ) : (
              <span className='font-mono'>
                {usdc === null
                  ? '—'
                  : `${formatDecimal(usdc, locale, TOKEN_DIGITS)} USDG`}
              </span>
            )}
          </Row>
        </dl>
      </CardContent>
    </Card>
  );
};
