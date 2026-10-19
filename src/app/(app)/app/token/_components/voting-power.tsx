'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { type Address, isAddressEqual, zeroAddress } from 'viem';
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
import { useKarbTx, useTxRunner } from '@/hooks/use-carb-tx';
import {
  CARB,
  formatKarb,
  sendDelegate,
  sendDepositVotes,
  sendWithdrawVotes,
  type TokenAccount,
} from '@/lib/carb';
import { formatAddress } from '@/lib/carb-format';
import { useLocaleStore, useT } from '@/lib/i18n';
import { formatAmountInput, parseAmountInput } from '@/lib/token-units';
import { messages } from '../_messages';

interface VotingPowerProps {
  account: Address | undefined;
  data: TokenAccount | undefined;
  symbol: string;
  decimals: number;
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className='text-muted-foreground text-xs'>{label}</dt>
    <dd className='font-semibold text-sm'>{value}</dd>
  </div>
);

const delegateLabel = (
  data: TokenAccount | undefined,
  account: Address | undefined,
  none: string,
  self: string
): string => {
  if (!(data && account) || data.delegate === zeroAddress) {
    return none;
  }
  return isAddressEqual(data.delegate, account)
    ? self
    : formatAddress(data.delegate);
};

/** Deposit / withdraw CARB into the voting wrapper (vCARB) and delegate its votes. */
const WrapperForm = ({
  account,
  data,
  symbol,
  decimals,
}: VotingPowerProps & { account: Address }) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);
  const { ctx, wrongNetwork } = useKarbTx();
  const runner = useTxRunner();
  const [value, setValue] = useState('');

  const balance = data?.balance ?? 0n;
  const wrapped = data?.wrapped ?? 0n;
  const parsed = parseAmountInput(value, decimals);
  const typed = value.trim() !== '';
  const alreadySelf =
    data !== undefined && isAddressEqual(data.delegate, account);
  const idle = Boolean(ctx) && !wrongNetwork && !runner.pending;

  const malformed = typed && parsed === null;
  const canDeposit = idle && parsed !== null && parsed <= balance;
  const canWithdraw = idle && parsed !== null && parsed <= wrapped;

  const deposit = async (event: FormEvent) => {
    event.preventDefault();
    if (!(ctx && parsed !== null)) {
      return;
    }
    const done = await runner.run(
      (callbacks) => sendDepositVotes(ctx, parsed, callbacks),
      t('vp.depositSuccess')
    );
    if (done) {
      setValue('');
    }
  };

  const withdraw = async () => {
    if (!(ctx && parsed !== null)) {
      return;
    }
    const done = await runner.run(
      (callbacks) => sendWithdrawVotes(ctx, parsed, callbacks.onSubmitted),
      t('vp.withdrawSuccess')
    );
    if (done) {
      setValue('');
    }
  };

  const delegateToSelf = async () => {
    if (!ctx) {
      return;
    }
    await runner.run(
      (callbacks) => sendDelegate(ctx, account, callbacks.onSubmitted),
      t('vp.delegateSuccess')
    );
  };

  return (
    <div className='space-y-4'>
      <form className='space-y-3' noValidate onSubmit={deposit}>
        <FormField
          error={malformed ? t('err.amount', { decimals }) : undefined}
          hint={t('vp.amountHint', {
            balance: formatKarb(balance, locale, decimals),
            wrapped: formatKarb(wrapped, locale, decimals),
            symbol,
          })}
          id='carb-votes-amount'
          label={t('act.amount', { symbol })}
        >
          <div className='flex gap-2'>
            <Input
              aria-describedby='carb-votes-amount-note'
              aria-invalid={malformed}
              autoComplete='off'
              id='carb-votes-amount'
              inputMode='decimal'
              onChange={(event) => setValue(event.target.value)}
              placeholder='0.0'
              spellCheck={false}
              value={value}
            />
            <Button
              disabled={balance === 0n}
              onClick={() => setValue(formatAmountInput(balance, decimals))}
              type='button'
              variant='outline'
            >
              {t('act.max')}
            </Button>
          </div>
        </FormField>
        {runner.stage === 'approving' && parsed !== null ? (
          <output className='block text-sm'>
            {t('vp.step.approving', {
              amount: formatKarb(parsed, locale, decimals),
              symbol,
            })}
          </output>
        ) : null}
        {runner.stage === 'sending' ? (
          <output className='block text-sm'>{t('vp.step.sending')}</output>
        ) : null}
        <div className='flex flex-wrap gap-2'>
          <Button disabled={!canDeposit} type='submit'>
            {runner.pending ? t('act.sending') : t('vp.deposit')}
          </Button>
          <Button
            disabled={!canWithdraw}
            onClick={withdraw}
            type='button'
            variant='outline'
          >
            {t('vp.withdraw')}
          </Button>
        </div>
        {parsed !== null && !canDeposit && !canWithdraw && idle ? (
          <p className='text-destructive text-xs' role='alert'>
            {t('vp.err.exceedsBoth')}
          </p>
        ) : null}
      </form>

      <div className='space-y-2 border-t border-dashed pt-4'>
        <p className='text-muted-foreground text-xs'>{t('vp.delegateNote')}</p>
        <div className='flex flex-wrap items-center gap-2'>
          <Button
            disabled={!idle || alreadySelf || wrapped === 0n}
            onClick={delegateToSelf}
            type='button'
            variant='outline'
          >
            {t('vp.delegateSelf')}
          </Button>
          <Button asChild size='sm' variant='ghost'>
            <Link href='/app/governance'>{t('vp.governanceLink')}</Link>
          </Button>
        </div>
      </div>
      <TxStatus
        error={runner.error}
        hash={runner.hash}
        wrongNetwork={wrongNetwork}
      />
    </div>
  );
};

/**
 * "Voting power" section of the token page. With the CarbVotes wrapper configured, governance needs CARB deposited
 * there; otherwise the votes are the CARB in the wallet, delegated. Staked or bonded CARB never carries votes.
 */
export const VotingPower = ({
  account,
  data,
  symbol,
  decimals,
}: VotingPowerProps) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);

  if (!CARB.governor) {
    return null;
  }

  const wrapperMode = CARB.votes !== null;
  const money = (wei: bigint | undefined) =>
    wei === undefined ? '—' : `${formatKarb(wei, locale, decimals)} ${symbol}`;
  const votesUnsupported = data !== undefined && !data.votesSupported;

  let body = <p className='text-muted-foreground text-sm'>{t('vp.connect')}</p>;
  if (votesUnsupported) {
    body = (
      <p className='text-amber-700 text-sm dark:text-amber-300' role='alert'>
        {t('vp.unsupported')}
      </p>
    );
  } else if (account && wrapperMode) {
    body = (
      <WrapperForm
        account={account}
        data={data}
        decimals={decimals}
        symbol={symbol}
      />
    );
  } else if (account) {
    body = (
      <Button asChild variant='outline'>
        <Link href='/app/governance'>{t('vp.governanceLink')}</Link>
      </Button>
    );
  }

  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle>{t('vp.title')}</CardTitle>
        <CardDescription>
          {t(wrapperMode ? 'vp.descriptionWrapper' : 'vp.descriptionNative', {
            symbol,
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {account ? (
          <dl className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
            <Stat
              label={t('vp.wallet', { symbol })}
              value={money(data?.balance)}
            />
            {wrapperMode ? (
              <Stat
                label={t('vp.wrapped', { symbol })}
                value={money(data?.wrapped)}
              />
            ) : null}
            <Stat
              label={t('vp.delegate')}
              value={delegateLabel(data, account, t('vp.none'), t('vp.self'))}
            />
            <Stat label={t('vp.votes')} value={money(data?.votes)} />
          </dl>
        ) : null}
        {body}
        <p className='border border-dashed p-3 text-xs'>{t('vp.noVotes')}</p>
      </CardContent>
    </Card>
  );
};
