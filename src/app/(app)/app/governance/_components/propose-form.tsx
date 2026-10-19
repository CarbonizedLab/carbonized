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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTokenAccount, useTokenInfo } from '@/hooks/use-carb-data';
import { useKarbTx, useTxRunner } from '@/hooks/use-carb-tx';
import { CARB, formatDuration, formatKarb, sendPropose } from '@/lib/carb';
import { explorerAddressUrl } from '@/lib/explorer';
import { type TranslateFn, useLocaleStore, useT } from '@/lib/i18n';
import {
  ACTIONS,
  type ActionDef,
  type BuildContext,
  type BuildResult,
  type BuiltCall,
  type FieldDef,
  type Message,
  type ParamSnapshot,
} from '../_lib/proposal-actions';
import { assertProposable, buildDescription } from '../_lib/proposal-submit';
import {
  useGovernorSettings,
  useParamContext,
} from '../_lib/use-governance-data';
import { messages } from '../_messages';

const MAX_TITLE_LENGTH = 100;

const EMPTY_SNAPSHOT: ParamSnapshot = {
  minPrice: null,
  feeBps: null,
  kycGate: null,
  provider: null,
  thresholds: null,
  minBond: null,
};

const INCOMPLETE: BuildResult = { ok: false, errors: {} };

type Values = Record<string, string>;

const fieldError = (
  built: BuildResult,
  name: string,
  t: TranslateFn
): string | undefined => {
  if (built.ok) {
    return;
  }
  const error: Message | undefined = built.errors[name];
  return error ? t(error.key, error.vars) : undefined;
};

const FieldInput = ({
  action,
  field,
  value,
  error,
  onChange,
}: {
  action: ActionDef;
  field: FieldDef;
  value: string;
  error: string | undefined;
  onChange: (value: string) => void;
}) => {
  const t = useT(messages);
  const id = `propose-${action.id}-${field.name}`;

  if (field.kind === 'choice') {
    return (
      <FormField error={error} id={id} label={t(field.labelKey)}>
        <Select onValueChange={onChange} value={value}>
          <SelectTrigger className='w-full' id={id}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(option.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
    );
  }

  return (
    <FormField
      error={error}
      hint={field.hintKey ? t(field.hintKey) : undefined}
      id={id}
      label={t(field.labelKey)}
    >
      <Input
        aria-describedby={`${id}-note`}
        aria-invalid={Boolean(error)}
        autoComplete='off'
        className={field.mono ? 'font-mono' : undefined}
        id={id}
        inputMode={field.mono ? 'text' : 'decimal'}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder}
        spellCheck={false}
        value={value}
      />
      {field.name === 'provider' && CARB.staking ? (
        <Button
          onClick={() => onChange(CARB.staking ?? '')}
          size='sm'
          type='button'
          variant='outline'
        >
          {t('f.provider.useStaking')}
        </Button>
      ) : null}
    </FormField>
  );
};

const SummaryPanel = ({
  action,
  summary,
  call,
  acknowledged,
  onAcknowledge,
  votingDelay,
  votingPeriod,
}: {
  action: ActionDef & { target: Address };
  summary: Message;
  call: BuiltCall;
  acknowledged: boolean;
  onAcknowledge: (checked: boolean) => void;
  votingDelay: number | undefined;
  votingPeriod: number | undefined;
}) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);
  return (
    <section
      aria-label={t('new.summaryTitle')}
      className='space-y-2 border border-primary/40 border-dashed bg-primary/5 p-4 text-sm'
    >
      <h3 className='font-semibold'>{t('new.summaryTitle')}</h3>
      <p>{t(summary.key, summary.vars)}</p>
      <p className='break-all text-muted-foreground text-xs'>
        {t('new.willCall', {
          fn: call.functionName,
          args: call.args.join(', '),
          target: action.target,
        })}{' '}
        <a
          className='underline'
          href={explorerAddressUrl(action.target)}
          rel='noopener noreferrer'
          target='_blank'
        >
          ↗
        </a>
      </p>
      {votingDelay !== undefined && votingPeriod !== undefined ? (
        <p className='text-muted-foreground text-xs'>
          {t('new.timeline', {
            delay: formatDuration(votingDelay, locale),
            period: formatDuration(votingPeriod, locale),
          })}
        </p>
      ) : null}
      <details className='text-xs'>
        <summary className='cursor-pointer'>{t('new.rawData')}</summary>
        <p className='mt-1 break-all font-mono'>{call.calldata}</p>
      </details>
      <p className='text-muted-foreground text-xs'>{t('new.englishNote')}</p>
      <div className='flex items-start gap-2 pt-1'>
        <input
          checked={acknowledged}
          className='mt-1 size-4 shrink-0 accent-primary'
          id='propose-ack'
          onChange={(event) => onAcknowledge(event.target.checked)}
          type='checkbox'
        />
        <Label className='font-normal' htmlFor='propose-ack'>
          {t('new.ack')}
        </Label>
      </div>
    </section>
  );
};

const ActionPicker = ({
  action,
  actionId,
  onChange,
}: {
  action: ActionDef | undefined;
  actionId: string;
  onChange: (id: string) => void;
}) => {
  const t = useT(messages);
  let description: string | null = null;
  if (action) {
    description =
      action.target === null
        ? t('new.notConfigured')
        : t(action.descriptionKey);
  }
  return (
    <div className='space-y-1.5'>
      <Label htmlFor='propose-action'>{t('new.action')}</Label>
      <Select onValueChange={onChange} value={actionId}>
        <SelectTrigger className='w-full' id='propose-action'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ACTIONS.map((candidate) => (
            <SelectItem
              disabled={candidate.target === null}
              key={candidate.id}
              value={candidate.id}
            >
              {t(candidate.labelKey)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description ? (
        <p className='text-muted-foreground text-xs'>{description}</p>
      ) : null}
    </div>
  );
};

/** Thresholds line: what the proposer needs vs holds, or a generic note while unknown. */
const ThresholdNote = ({ account }: { account: Address | undefined }) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);
  const settings = useGovernorSettings();
  const tokenInfo = useTokenInfo();
  const tokenAccount = useTokenAccount(account);

  const threshold = settings.data?.proposalThreshold;
  const votes = tokenAccount.data?.votes;
  const decimals = tokenInfo.data?.decimals;
  if (
    threshold === undefined ||
    votes === undefined ||
    decimals === undefined
  ) {
    return <p className='text-xs'>{t('new.thresholdUnknown')}</p>;
  }
  return (
    <p className='text-xs'>
      {t('new.threshold', {
        amount: formatKarb(threshold, locale, decimals),
        symbol: tokenInfo.data?.symbol ?? 'CARB',
        votes: formatKarb(votes, locale, decimals),
      })}
    </p>
  );
};

export const ProposeForm = ({ account }: { account: Address | undefined }) => {
  const t = useT(messages);
  const { ctx, wrongNetwork } = useKarbTx();
  const runner = useTxRunner();
  const settings = useGovernorSettings();
  const params = useParamContext();
  const tokenInfo = useTokenInfo();

  const firstAvailable = ACTIONS.find((candidate) => candidate.target !== null);
  const [actionId, setActionId] = useState<string>(firstAvailable?.id ?? '');
  const [values, setValues] = useState<Values>({});
  const [title, setTitle] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);

  const action = ACTIONS.find((candidate) => candidate.id === actionId);
  const target = action?.target ?? null;

  const carbDecimals = tokenInfo.data?.decimals;
  const buildContext: BuildContext | null =
    carbDecimals === undefined
      ? null
      : {
          paymentDecimals: params.data?.paymentDecimals ?? null,
          carbDecimals,
          maxMinPrice: params.data?.maxMinPrice ?? null,
          current: params.data?.snapshot ?? EMPTY_SNAPSHOT,
        };
  const built: BuildResult =
    action && target && buildContext
      ? action.build(values, buildContext)
      : INCOMPLETE;

  const trimmedTitle = title.trim();
  const titleValid =
    trimmedTitle.length > 0 && trimmedTitle.length <= MAX_TITLE_LENGTH;
  const paymentUnknown =
    action?.id === 'minPrice' &&
    params.isSuccess &&
    params.data.paymentDecimals === null;

  const changeAction = (next: string) => {
    setActionId(next);
    setValues({});
    setAcknowledged(false);
  };

  const setValue = (name: string, value: string) => {
    setValues((previous) => ({ ...previous, [name]: value }));
    setAcknowledged(false);
  };

  const canSubmit =
    Boolean(ctx) &&
    built.ok &&
    titleValid &&
    acknowledged &&
    !wrongNetwork &&
    !runner.pending;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const governor = CARB.governor;
    if (!(ctx && target && built.ok && governor)) {
      return;
    }
    const { call, summary } = built;
    const description = buildDescription(
      trimmedTitle,
      messages.en[summary.key],
      summary
    );

    const done = await runner.run(async (callbacks) => {
      await assertProposable(ctx, governor, target, call, {
        blocked: t('new.blocked'),
        noCode: t('new.noCode'),
      });
      return await sendPropose(
        ctx,
        { targets: [target], values: [0n], calldatas: [call.calldata] },
        description,
        callbacks.onSubmitted
      );
    }, t('new.success'));
    if (done) {
      setValues({});
      setTitle('');
      setAcknowledged(false);
    }
  };

  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle>{t('new.title')}</CardTitle>
        <CardDescription>{t('new.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className='space-y-5' noValidate onSubmit={submit}>
          <p className='border border-dashed p-3 text-muted-foreground text-xs'>
            {t('new.outside')}
          </p>

          {account ? null : (
            <p className='text-muted-foreground text-sm'>{t('new.connect')}</p>
          )}

          <ThresholdNote account={account} />

          <ActionPicker
            action={action}
            actionId={actionId}
            onChange={changeAction}
          />

          {action && target ? (
            <div className='space-y-4'>
              {action.fields
                .filter((field) => field.showWhen?.(values) ?? true)
                .map((field) => (
                  <FieldInput
                    action={action}
                    error={fieldError(built, field.name, t)}
                    field={field}
                    key={field.name}
                    onChange={(value) => setValue(field.name, value)}
                    value={values[field.name] ?? ''}
                  />
                ))}
            </div>
          ) : null}

          {paymentUnknown ? (
            <p className='text-destructive text-sm' role='alert'>
              {t('new.paymentUnknown')}
            </p>
          ) : null}

          <FormField
            error={
              title !== '' && !titleValid ? t('err.titleRequired') : undefined
            }
            hint={t('new.titleHint', { max: MAX_TITLE_LENGTH })}
            id='propose-title'
            label={t('new.titleLabel')}
          >
            <Input
              aria-describedby='propose-title-note'
              autoComplete='off'
              id='propose-title'
              maxLength={MAX_TITLE_LENGTH}
              onChange={(event) => {
                setTitle(event.target.value);
                setAcknowledged(false);
              }}
              value={title}
            />
          </FormField>

          {built.ok && action && target ? (
            <SummaryPanel
              acknowledged={acknowledged}
              action={{ ...action, target }}
              call={built.call}
              onAcknowledge={setAcknowledged}
              summary={built.summary}
              votingDelay={settings.data?.votingDelay}
              votingPeriod={settings.data?.votingPeriod}
            />
          ) : null}

          <Button disabled={!canSubmit} type='submit'>
            {runner.pending ? t('new.submitting') : t('new.submit')}
          </Button>
          <TxStatus
            error={runner.error}
            hash={runner.hash}
            wrongNetwork={wrongNetwork}
          />
        </form>
      </CardContent>
    </Card>
  );
};
