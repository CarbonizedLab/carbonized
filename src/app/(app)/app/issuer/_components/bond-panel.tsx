'use client';

import { BookOpen } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { type Address, type Hash, keccak256, toBytes } from 'viem';
import { KarbLegalNote, TxStatus } from '@/components/app/carb-shared';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  useBondState,
  useTokenAccount,
  useTokenInfo,
} from '@/hooks/use-carb-data';
import { useKarbTx, useNowSeconds, useTxRunner } from '@/hooks/use-carb-tx';
import {
  formatDuration,
  formatKarb,
  sendBond,
  sendDisputeSlash,
  sendStartUnbond,
  sendWithdrawBond,
} from '@/lib/carb';
import type {
  BondState,
  SlashDestination,
  SlashInfo,
  SlashOutcome,
} from '@/lib/carb-bond';
import { formatAddress } from '@/lib/carb-format';
import { formatChainDate } from '@/lib/chain-format';
import { type TranslateFn, useLocaleStore, useT } from '@/lib/i18n';
import { formatAmountInput, parseAmountInput } from '@/lib/token-units';
import { bondMessages } from '../_bond-messages';

const HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

const Row = ({ label, children }: { label: string; children: string }) => (
  <div>
    <dt className='text-muted-foreground text-xs'>{label}</dt>
    <dd className='font-semibold text-sm'>{children}</dd>
  </div>
);

interface Money {
  symbol: string;
  decimals: number;
}

const evidenceHash = (raw: string): Hash | null => {
  const value = raw.trim();
  if (HASH_PATTERN.test(value)) {
    return value as Hash;
  }
  return value === '' ? null : keccak256(toBytes(value));
};

const SlashNotice = ({
  slash,
  money,
  bondDecimals,
}: {
  slash: SlashInfo;
  money: Money;
  bondDecimals: number;
}) => {
  const t = useT(bondMessages);
  const locale = useLocaleStore((state) => state.locale);
  const now = useNowSeconds();
  const { ctx, wrongNetwork } = useKarbTx();
  const runner = useTxRunner();
  const [evidence, setEvidence] = useState('');

  const windowOpen = now < slash.executableAt;
  const hash = evidenceHash(evidence);

  let windowText = t('slash.windowOpen', {
    time: formatDuration(slash.executableAt - now, locale),
    date: formatChainDate(slash.executableAt, locale),
  });
  if (!windowOpen) {
    windowText = t(
      slash.disputed ? 'slash.windowClosedDisputed' : 'slash.windowClosed',
      { date: formatChainDate(slash.expiresAt, locale) }
    );
  }

  const dispute = async (event: FormEvent) => {
    event.preventDefault();
    if (!(ctx && hash)) {
      return;
    }
    const done = await runner.run(
      (callbacks) =>
        sendDisputeSlash(ctx, slash.id, hash, callbacks.onSubmitted),
      t('slash.disputeSuccess')
    );
    if (done) {
      setEvidence('');
    }
  };

  return (
    <section
      aria-label={t('slash.title')}
      className='space-y-3 border border-amber-500/40 border-dashed p-4 text-sm'
    >
      <h3 className='font-semibold text-amber-800 dark:text-amber-200'>
        {t('slash.title')}
      </h3>
      <p>{t('slash.intro')}</p>
      <dl className='grid gap-3 sm:grid-cols-2'>
        <Row label={t('slash.amount')}>
          {`${formatKarb(slash.amount, locale, bondDecimals)} ${money.symbol}`}
        </Row>
        <Row label={t('slash.reason')}>
          {slash.reason || t('slash.noReason')}
        </Row>
      </dl>
      <p className='text-muted-foreground'>{windowText}</p>
      {slash.disputed ? (
        <p className='font-medium'>{t('slash.disputed')}</p>
      ) : (
        <form className='space-y-3' noValidate onSubmit={dispute}>
          <FormField
            hint={t('slash.evidenceHint')}
            id='slash-evidence'
            label={t('slash.evidence')}
          >
            <Input
              aria-describedby='slash-evidence-note'
              autoComplete='off'
              id='slash-evidence'
              onChange={(event) => setEvidence(event.target.value)}
              spellCheck={false}
              value={evidence}
            />
          </FormField>
          <Button
            disabled={!(ctx && hash) || wrongNetwork || runner.pending}
            type='submit'
            variant='outline'
          >
            {runner.pending ? t('bond.confirm') : t('slash.dispute')}
          </Button>
          {evidence === '' ? (
            <p className='text-muted-foreground text-xs'>
              {t('slash.err.evidence')}
            </p>
          ) : null}
          <TxStatus
            error={runner.error}
            hash={runner.hash}
            wrongNetwork={wrongNetwork}
          />
        </form>
      )}
    </section>
  );
};

const BondForm = ({
  state,
  money,
  balance,
}: {
  state: BondState;
  money: Money;
  balance: bigint;
}) => {
  const t = useT(bondMessages);
  const locale = useLocaleStore((state_) => state_.locale);
  const { ctx, wrongNetwork } = useKarbTx();
  const runner = useTxRunner();
  const [value, setValue] = useState('');

  const parsed = parseAmountInput(value, money.decimals);
  const total = parsed === null ? null : state.position.amount + parsed;
  const typed = value.trim() !== '';
  const open = state.pathOpen && !state.blocked && !state.position.unbonding;

  let error: string | undefined;
  if (typed && parsed === null) {
    error = t('bond.err.amount', { decimals: money.decimals });
  } else if (parsed !== null && parsed > balance) {
    error = t('bond.err.balance');
  } else if (total !== null && total < state.minBond) {
    error = t('bond.err.minimum', {
      amount: formatKarb(state.minBond, locale, money.decimals),
      symbol: money.symbol,
    });
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!(ctx && parsed !== null)) {
      return;
    }
    const done = await runner.run(
      (callbacks) => sendBond(ctx, parsed, callbacks),
      t('bond.success')
    );
    if (done) {
      setValue('');
    }
  };

  const canSubmit =
    open &&
    Boolean(ctx) &&
    parsed !== null &&
    !error &&
    !wrongNetwork &&
    !runner.pending;

  return (
    <form className='space-y-3' noValidate onSubmit={submit}>
      <FormField
        error={error}
        hint={t('bond.walletHint', {
          amount: formatKarb(balance, locale, money.decimals),
          symbol: money.symbol,
        })}
        id='bond-amount'
        label={t('bond.amount', { symbol: money.symbol })}
      >
        <div className='flex gap-2'>
          <Input
            aria-describedby='bond-amount-note'
            aria-invalid={Boolean(error)}
            autoComplete='off'
            disabled={!open}
            id='bond-amount'
            inputMode='decimal'
            onChange={(event) => setValue(event.target.value)}
            placeholder='0.0'
            spellCheck={false}
            value={value}
          />
          <Button
            disabled={!open || balance === 0n}
            onClick={() => setValue(formatAmountInput(balance, money.decimals))}
            type='button'
            variant='outline'
          >
            {t('bond.max')}
          </Button>
        </div>
      </FormField>
      {runner.stage === 'approving' && parsed !== null ? (
        <output className='block text-sm'>
          {t('bond.approving', {
            amount: formatKarb(parsed, locale, money.decimals),
            symbol: money.symbol,
          })}
        </output>
      ) : null}
      {runner.stage === 'sending' ? (
        <output className='block text-sm'>{t('bond.sending')}</output>
      ) : null}
      <Button disabled={!canSubmit} type='submit'>
        {runner.pending ? t('bond.confirm') : t('bond.action')}
      </Button>
      <TxStatus
        error={runner.error}
        hash={runner.hash}
        wrongNetwork={wrongNetwork}
      />
    </form>
  );
};

const ExitActions = ({ state, now }: { state: BondState; now: number }) => {
  const t = useT(bondMessages);
  const locale = useLocaleStore((s) => s.locale);
  const { ctx, wrongNetwork } = useKarbTx();
  const runner = useTxRunner();
  const { position, slash } = state;

  const frozen = slash !== null;
  const hasBond = position.amount > 0n;
  const canUnbond = hasBond && !position.unbonding && !frozen;
  const canWithdraw =
    position.unbonding && now >= position.releaseAt && !frozen;
  const idle = Boolean(ctx) && !wrongNetwork && !runner.pending;

  const unbond = async () => {
    if (!ctx) {
      return;
    }
    await runner.run(
      (callbacks) => sendStartUnbond(ctx, callbacks.onSubmitted),
      t('bond.unbondSuccess')
    );
  };

  const withdraw = async () => {
    if (!ctx) {
      return;
    }
    await runner.run(
      (callbacks) => sendWithdrawBond(ctx, callbacks.onSubmitted),
      t('bond.withdrawSuccess')
    );
  };

  if (!hasBond) {
    return null;
  }

  return (
    <div className='space-y-3 border-t border-dashed pt-4'>
      {position.unbonding ? (
        <>
          <p className='text-muted-foreground text-xs'>
            {t('bond.withdrawNote')}
          </p>
          <Button
            disabled={!(idle && canWithdraw)}
            onClick={withdraw}
            type='button'
          >
            {runner.pending ? t('bond.confirm') : t('bond.withdraw')}
          </Button>
        </>
      ) : (
        <>
          <p className='text-muted-foreground text-xs'>
            {t('bond.unbondNote', {
              delay: formatDuration(state.unbondDelay, locale),
            })}
          </p>
          <Button
            disabled={!(idle && canUnbond)}
            onClick={unbond}
            type='button'
            variant='outline'
          >
            {runner.pending ? t('bond.confirm') : t('bond.unbond')}
          </Button>
        </>
      )}
      <TxStatus
        error={runner.error}
        hash={runner.hash}
        wrongNetwork={wrongNetwork}
      />
    </div>
  );
};

const statusText = (
  state: BondState,
  now: number,
  locale: 'en' | 'zh',
  t: TranslateFn
): string => {
  const { position } = state;
  if (position.amount === 0n && !position.unbonding) {
    return t('bond.status.none');
  }
  if (position.unbonding) {
    return now >= position.releaseAt
      ? t('bond.status.ready')
      : t('bond.status.unbonding', {
          time: formatDuration(position.releaseAt - now, locale),
          date: formatChainDate(position.releaseAt, locale),
        });
  }
  if (position.roleViaBond) {
    return t('bond.status.bonded');
  }
  return position.amount < state.minBond
    ? t('bond.status.below')
    : t('bond.status.bondedDirect');
};

/** Where slashed CARB goes (configured treasury, else burned if the token can burn, else the sink) and the last real outcome. */
const SlashOutcomeNote = ({
  destination,
  lastSlash,
  money,
}: {
  destination: SlashDestination;
  lastSlash: SlashOutcome | null;
  money: Money;
}) => {
  const t = useT(bondMessages);
  const locale = useLocaleStore((state) => state.locale);

  let where = t('slash.dest.burn');
  if (destination.treasury) {
    where = t('slash.dest.treasury', {
      address: formatAddress(destination.treasury),
    });
  } else if (destination.sink) {
    where = t('slash.dest.burnOrSink', {
      address: formatAddress(destination.sink),
    });
  }

  let last: string | null = null;
  if (lastSlash) {
    const amount = formatKarb(lastSlash.amount, locale, money.decimals);
    last = lastSlash.burned
      ? t('slash.last.burned', { amount, symbol: money.symbol })
      : t('slash.last.sent', {
          amount,
          symbol: money.symbol,
          address: lastSlash.sink ? formatAddress(lastSlash.sink) : '—',
        });
  }

  return (
    <div className='space-y-1 text-xs'>
      <p className='text-muted-foreground'>{where}</p>
      {last ? (
        <p className='font-medium'>
          {t('slash.last.title')}: {last}
        </p>
      ) : null}
    </div>
  );
};

/** Bond panel of the issuer page; rendered only when `NEXT_PUBLIC_ISSUER_BOND` is configured. */
export const BondPanel = ({ account }: { account: Address | undefined }) => {
  const t = useT(bondMessages);
  const locale = useLocaleStore((state) => state.locale);
  const now = useNowSeconds();
  const bond = useBondState(account);
  const info = useTokenInfo();
  const token = useTokenAccount(account);

  const money: Money | null = info.data
    ? { symbol: info.data.symbol, decimals: info.data.decimals }
    : null;

  const renderBody = () => {
    if (!account) {
      return (
        <p className='text-muted-foreground text-sm'>{t('bond.connect')}</p>
      );
    }
    if (bond.isLoading || info.isLoading) {
      return <Skeleton className='h-32 w-full' />;
    }
    if (bond.isError || !bond.data || !money) {
      return (
        <p className='text-destructive text-sm' role='alert'>
          {t('bond.failed')}
        </p>
      );
    }
    const state = bond.data;
    return (
      <div className='space-y-4'>
        <dl className='grid gap-3 sm:grid-cols-3'>
          <Row label={t('bond.current')}>
            {`${formatKarb(state.position.amount, locale, money.decimals)} ${money.symbol}`}
          </Row>
          <Row label={t('bond.minimum')}>
            {`${formatKarb(state.minBond, locale, money.decimals)} ${money.symbol}`}
          </Row>
          <Row label={t('bond.path')}>
            {state.pathOpen ? t('bond.pathOpen') : t('bond.pathClosed')}
          </Row>
        </dl>
        <p className='text-sm'>
          <span className='font-medium'>{t('bond.status')}: </span>
          {statusText(state, now, locale, t)}
        </p>
        <SlashOutcomeNote
          destination={state.destination}
          lastSlash={state.lastSlash}
          money={money}
        />
        <p className='text-muted-foreground text-xs'>
          {t('bond.requirement', {
            amount: formatKarb(state.minBond, locale, money.decimals),
            symbol: money.symbol,
          })}{' '}
          {t('bond.minimumNote')}
        </p>
        {state.blocked ? (
          <p
            className='text-amber-700 text-sm dark:text-amber-300'
            role='alert'
          >
            {t('bond.blocked')}
          </p>
        ) : null}
        {state.pathOpen ? null : (
          <p className='text-muted-foreground text-xs'>
            {t('bond.pathClosedNote')}
          </p>
        )}
        {state.slash ? (
          <SlashNotice
            bondDecimals={money.decimals}
            money={money}
            slash={state.slash}
          />
        ) : null}
        <BondForm
          balance={token.data?.balance ?? 0n}
          money={money}
          state={state}
        />
        <ExitActions now={now} state={state} />
      </div>
    );
  };

  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle>{t('bond.title')}</CardTitle>
        <CardDescription>{t('bond.description')}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {renderBody()}
        <KarbLegalNote />
        <Button asChild size='sm' variant='ghost'>
          <Link href='/docs/token/issuer-bond'>
            <BookOpen />
            {t('bond.docs')}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
};
