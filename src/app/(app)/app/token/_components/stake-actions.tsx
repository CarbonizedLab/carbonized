'use client';

import { type FormEvent, useState } from 'react';
import type { Address } from 'viem';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useKarbTx, useNowSeconds, useTxRunner } from '@/hooks/use-carb-tx';
import {
  formatDuration,
  formatKarb,
  type StakePosition,
  type StakingParams,
  sendStake,
  sendUnstake,
  sendWithdrawStake,
} from '@/lib/carb';
import { useLocaleStore, useT } from '@/lib/i18n';
import { formatAmountInput, parseAmountInput } from '@/lib/token-units';
import { messages } from '../_messages';

interface StakeActionsProps {
  account: Address | undefined;
  symbol: string;
  decimals: number;
  /** Wallet balance of CARB (not staked). */
  balance: bigint;
  position: StakePosition | undefined;
  params: StakingParams | undefined;
}

type AmountMode = 'stake' | 'unstake';

interface FormProps extends Omit<StakeActionsProps, 'account'> {
  account: Address;
}

const AmountForm = ({
  mode,
  symbol,
  decimals,
  balance,
  position,
  params,
}: FormProps & { mode: AmountMode }) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);
  const { ctx, wrongNetwork } = useKarbTx();
  const runner = useTxRunner();
  const [value, setValue] = useState('');

  const staked = position ? position.matured + position.pending : 0n;
  const limit = mode === 'stake' ? balance : staked;
  const parsed = parseAmountInput(value, decimals);
  const typed = value.trim() !== '';

  let error: string | undefined;
  if (typed && parsed === null) {
    error = t('err.amount', { decimals });
  } else if (parsed !== null && parsed > limit) {
    error = t(mode === 'stake' ? 'err.exceedsBalance' : 'err.exceedsStaked');
  }

  const canSubmit =
    Boolean(ctx) &&
    parsed !== null &&
    !error &&
    !wrongNetwork &&
    !runner.pending;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!(ctx && parsed !== null)) {
      return;
    }
    const done = await runner.run(
      (callbacks) =>
        mode === 'stake'
          ? sendStake(ctx, parsed, callbacks)
          : sendUnstake(ctx, parsed, callbacks.onSubmitted),
      t(`${mode}.success`)
    );
    if (done) {
      setValue('');
    }
  };

  const hint =
    mode === 'stake'
      ? t('stake.hint', {
          warmup: params ? formatDuration(params.warmup, locale) : '…',
        })
      : t('unstake.hint', {
          cooldown: params ? formatDuration(params.cooldown, locale) : '…',
        });
  const limitHint =
    mode === 'stake'
      ? t('act.balanceHint', {
          amount: formatKarb(balance, locale, decimals),
          symbol,
        })
      : t('act.stakedHint', {
          amount: formatKarb(staked, locale, decimals),
          symbol,
        });

  let buttonLabel = t(`act.${mode}`);
  if (runner.pending) {
    buttonLabel = t('act.sending');
  }

  return (
    <form className='space-y-4' noValidate onSubmit={submit}>
      <p className='text-muted-foreground text-sm'>{hint}</p>
      <FormField
        error={error}
        hint={limitHint}
        id={`carb-${mode}-amount`}
        label={t('act.amount', { symbol })}
      >
        <div className='flex gap-2'>
          <Input
            aria-describedby={`carb-${mode}-amount-note`}
            aria-invalid={Boolean(error)}
            autoComplete='off'
            id={`carb-${mode}-amount`}
            inputMode='decimal'
            onChange={(event) => setValue(event.target.value)}
            placeholder='0.0'
            spellCheck={false}
            value={value}
          />
          <Button
            disabled={limit === 0n}
            onClick={() => setValue(formatAmountInput(limit, decimals))}
            type='button'
            variant='outline'
          >
            {t('act.max')}
          </Button>
        </div>
      </FormField>
      {runner.stage === 'approving' && parsed !== null ? (
        <output className='block text-sm'>
          {t('stake.step.approving', {
            amount: formatKarb(parsed, locale, decimals),
            symbol,
          })}
        </output>
      ) : null}
      {runner.stage === 'sending' && mode === 'stake' ? (
        <output className='block text-sm'>{t('stake.step.sending')}</output>
      ) : null}
      <Button disabled={!canSubmit} type='submit'>
        {buttonLabel}
      </Button>
      <TxStatus
        error={runner.error}
        hash={runner.hash}
        wrongNetwork={wrongNetwork}
      />
    </form>
  );
};

const WithdrawForm = ({
  symbol,
  decimals,
  position,
}: Pick<FormProps, 'symbol' | 'decimals' | 'position'>) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);
  const now = useNowSeconds();
  const { ctx, wrongNetwork } = useKarbTx();
  const runner = useTxRunner();

  const cooling = position?.cooling ?? 0n;
  const unlockAt = position?.unlockAt ?? 0;
  const ready = cooling > 0n && now >= unlockAt;
  const amount = formatKarb(cooling, locale, decimals);

  let status = t('withdraw.none');
  if (cooling > 0n) {
    status = ready
      ? t('withdraw.ready', { amount, symbol })
      : t('withdraw.wait', {
          amount,
          symbol,
          time: formatDuration(unlockAt - now, locale),
        });
  }

  const withdraw = async () => {
    if (!ctx) {
      return;
    }
    await runner.run(
      (callbacks) => sendWithdrawStake(ctx, callbacks.onSubmitted),
      t('withdraw.success')
    );
  };

  return (
    <div className='space-y-4'>
      <p className='text-muted-foreground text-sm'>{t('withdraw.hint')}</p>
      <output className='block font-medium text-sm'>{status}</output>
      <Button
        disabled={!(ctx && ready) || wrongNetwork || runner.pending}
        onClick={withdraw}
        type='button'
      >
        {runner.pending ? t('act.sending') : t('act.withdraw')}
      </Button>
      <TxStatus
        error={runner.error}
        hash={runner.hash}
        wrongNetwork={wrongNetwork}
      />
    </div>
  );
};

export const StakeActions = ({ account, ...rest }: StakeActionsProps) => {
  const t = useT(messages);
  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle>{t('act.title')}</CardTitle>
        <CardDescription>{t('act.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {account ? (
          <Tabs defaultValue='stake'>
            <TabsList>
              <TabsTrigger value='stake'>{t('act.stake')}</TabsTrigger>
              <TabsTrigger value='unstake'>{t('act.unstake')}</TabsTrigger>
              <TabsTrigger value='withdraw'>{t('act.withdraw')}</TabsTrigger>
            </TabsList>
            <TabsContent className='pt-4' value='stake'>
              <AmountForm account={account} mode='stake' {...rest} />
            </TabsContent>
            <TabsContent className='pt-4' value='unstake'>
              <AmountForm account={account} mode='unstake' {...rest} />
            </TabsContent>
            <TabsContent className='pt-4' value='withdraw'>
              <WithdrawForm
                decimals={rest.decimals}
                position={rest.position}
                symbol={rest.symbol}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <p className='text-muted-foreground text-sm'>{t('act.connect')}</p>
        )}
      </CardContent>
    </Card>
  );
};
