'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { type Address, isAddress, isAddressEqual, zeroAddress } from 'viem';
import { TxStatus } from '@/components/app/carb-shared';
import { FormField } from '@/components/app/form-field';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useTokenAccount, useTokenInfo } from '@/hooks/use-carb-data';
import { useKarbTx, useTxRunner } from '@/hooks/use-carb-tx';
import { CARB, formatKarb, sendDelegate, type TokenAccount } from '@/lib/carb';
import { formatAddress } from '@/lib/carb-format';
import { useLocaleStore, useT } from '@/lib/i18n';
import { messages } from '../_messages';

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className='text-muted-foreground text-xs'>{label}</dt>
    <dd className='font-semibold'>{value}</dd>
  </div>
);

const DelegateStats = ({
  data,
  account,
  symbol,
  decimals,
}: {
  data: TokenAccount | undefined;
  account: Address;
  symbol: string;
  decimals: number | undefined;
}) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);

  let delegateLabel = t('del.none');
  if (data && isAddressEqual(data.delegate, account)) {
    delegateLabel = t('del.self');
  } else if (data && data.delegate !== zeroAddress) {
    delegateLabel = formatAddress(data.delegate);
  }
  const money = (wei: bigint | undefined) =>
    wei === undefined || decimals === undefined
      ? '—'
      : `${formatKarb(wei, locale, decimals)} ${symbol}`;

  return (
    <dl className='grid gap-2 text-sm sm:grid-cols-3'>
      <Stat
        label={t(CARB.votes ? 'del.balanceWrapped' : 'del.balance')}
        value={money(CARB.votes ? data?.wrapped : data?.balance)}
      />
      <Stat label={t('del.delegate')} value={delegateLabel} />
      <Stat label={t('del.votes')} value={money(data?.votes)} />
    </dl>
  );
};

export const DelegateCard = ({ account }: { account: Address | undefined }) => {
  const t = useT(messages);
  const info = useTokenInfo();
  const data = useTokenAccount(account);
  const { ctx, wrongNetwork } = useKarbTx();
  const runner = useTxRunner();
  const [other, setOther] = useState('');

  const target = other.trim();
  const otherValid = isAddress(target) && target !== zeroAddress;
  const otherInvalid = target !== '' && !otherValid;
  const busy = runner.pending || wrongNetwork || !ctx;
  const alreadySelf =
    account !== undefined &&
    data.data !== undefined &&
    isAddressEqual(data.data.delegate, account);

  const delegateTo = async (delegatee: Address) => {
    if (!ctx) {
      return;
    }
    const done = await runner.run(
      (callbacks) => sendDelegate(ctx, delegatee, callbacks.onSubmitted),
      t('del.success')
    );
    if (done) {
      setOther('');
    }
  };

  const submitOther = async (event: FormEvent) => {
    event.preventDefault();
    if (isAddress(target) && target !== zeroAddress) {
      await delegateTo(target);
    }
  };

  if (!(CARB.token && account)) {
    return (
      <Card className='rounded-none border-dashed shadow-none'>
        <CardHeader>
          <CardTitle>{t('del.title')}</CardTitle>
          <CardDescription>{t('del.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className='text-muted-foreground text-sm'>
            {CARB.token ? t('del.connect') : t('del.notConfigured')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle>{t('del.title')}</CardTitle>
        <CardDescription>{t('del.description')}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <DelegateStats
          account={account}
          data={data.data}
          decimals={info.data?.decimals}
          symbol={info.data?.symbol ?? 'CARB'}
        />

        <Button
          disabled={busy || alreadySelf}
          onClick={() => delegateTo(account)}
          type='button'
        >
          {runner.pending ? t('del.sending') : t('del.toSelf')}
        </Button>

        <form className='space-y-3' noValidate onSubmit={submitOther}>
          <FormField
            error={otherInvalid ? t('err.address') : undefined}
            hint={t('del.otherHint')}
            id='delegate-other'
            label={t('del.otherLabel')}
          >
            <Input
              aria-describedby='delegate-other-note'
              aria-invalid={otherInvalid}
              autoComplete='off'
              className='font-mono'
              id='delegate-other'
              onChange={(event) => setOther(event.target.value)}
              placeholder='0x…'
              spellCheck={false}
              value={other}
            />
          </FormField>
          <Button
            disabled={busy || !otherValid}
            type='submit'
            variant='outline'
          >
            {t('del.toOther')}
          </Button>
        </form>

        <p className='text-muted-foreground text-xs'>{t('del.note')}</p>
        {CARB.votes ? (
          <p className='border border-dashed p-3 text-xs'>
            {t('del.wrapperNote')}{' '}
            <Link className='underline' href='/app/token'>
              {t('del.wrapperLink')}
            </Link>
          </p>
        ) : null}
        {data.data && !data.data.votesSupported ? (
          <p
            className='text-amber-700 text-sm dark:text-amber-300'
            role='alert'
          >
            {t('del.unsupported')}
          </p>
        ) : null}
        <TxStatus
          error={runner.error}
          hash={runner.hash}
          wrongNetwork={wrongNetwork}
        />
      </CardContent>
    </Card>
  );
};
