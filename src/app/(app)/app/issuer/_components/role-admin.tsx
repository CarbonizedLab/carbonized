'use client';

import { type UseQueryResult, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { Address, Hash } from 'viem';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { explorerTxUrl } from '@/lib/explorer';
import { type TranslateFn, useT } from '@/lib/i18n';
import { isMainnetNetwork } from '@/lib/network';
import { sendIssuerRoleChange, type TargetLookup } from '../_lib/issuer-chain';
import { isValidRecipient } from '../_lib/issuer-utils';
import { useIssuerTx, useTargetLookup } from '../_lib/use-issuer-data';
import { messages } from '../_messages';
import { Field } from './field';

type RoleAction = 'grantRole' | 'revokeRole';

const describeLookup = (
  lookup: UseQueryResult<TargetLookup>,
  valid: boolean,
  t: TranslateFn
): string | null => {
  if (!valid) {
    return null;
  }
  if (lookup.isLoading) {
    return t('admin.checking');
  }
  if (lookup.isError || !lookup.data) {
    return t('admin.lookupFailed');
  }
  const role = lookup.data.holds ? t('admin.holds') : t('admin.holdsNot');
  const kind = lookup.data.isContract
    ? t('admin.kindContract')
    : t('admin.kindKey');
  return `${role} · ${kind}`;
};

interface SingleKeyNoticeProps {
  needsAck: boolean;
  accepted: boolean;
  onAccept: (accepted: boolean) => void;
  t: TranslateFn;
}

const SingleKeyNotice = ({
  needsAck,
  accepted,
  onAccept,
  t,
}: SingleKeyNoticeProps) => (
  <div className='space-y-2 text-sm'>
    <p className='text-amber-700 dark:text-amber-300' role='alert'>
      {t('admin.singleKey')}
    </p>
    {needsAck ? (
      <label className='flex items-start gap-2'>
        <input
          checked={accepted}
          className='mt-1 size-4 accent-primary'
          onChange={(event) => onAccept(event.target.checked)}
          type='checkbox'
        />
        <span>{t('admin.ackSingleKey')}</span>
      </label>
    ) : null}
  </div>
);

interface TxStatusProps {
  wrongNetwork: boolean;
  error: string | null;
  hash: Hash | null;
  t: TranslateFn;
}

const TxStatus = ({ wrongNetwork, error, hash, t }: TxStatusProps) => (
  <>
    {wrongNetwork ? (
      <p className='text-amber-700 text-sm dark:text-amber-300' role='alert'>
        {t('common.wrongNetwork')}
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
        {t('common.viewTx')}
        <ExternalLink className='size-3' />
      </a>
    ) : null}
  </>
);
/** Grant / revoke NATIVE_ISSUER_ROLE. Rendered only for DEFAULT_ADMIN_ROLE holders. */
export const RoleAdmin = ({ account }: { account: Address }) => {
  const t = useT(messages);
  const queryClient = useQueryClient();
  const { ctx, wrongNetwork } = useIssuerTx();

  const [target, setTarget] = useState('');
  const [acceptSingleKey, setAcceptSingleKey] = useState(false);
  const [pending, setPending] = useState<RoleAction | null>(null);
  const [lastHash, setLastHash] = useState<Hash | null>(null);
  const [error, setError] = useState<string | null>(null);

  const value = target.trim();
  const valid = isValidRecipient(value);
  const invalid = value !== '' && !valid;

  const lookup = useTargetLookup(value, valid);

  const holdsRole = lookup.data?.holds;
  const isSingleKey = valid && !lookup.isLoading && !lookup.data?.isContract;
  const needsAck = isMainnetNetwork && isSingleKey;
  const isSelf = valid && value.toLowerCase() === account.toLowerCase();

  const run = async (action: RoleAction) => {
    if (!(ctx && valid)) {
      return;
    }
    setError(null);
    setLastHash(null);
    setPending(action);
    try {
      const receipt = await sendIssuerRoleChange(
        ctx,
        action,
        value as Address,
        (hash) => setLastHash(hash)
      );
      setLastHash(receipt.transactionHash);
      toast.success(
        action === 'grantRole' ? t('admin.granted') : t('admin.revoked')
      );
      setAcceptSingleKey(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['nft-issuers'] }),
        queryClient.invalidateQueries({ queryKey: ['nft-roles'] }),
        queryClient.invalidateQueries({ queryKey: ['issuer-target'] }),
      ]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('admin.failed'));
    } finally {
      setPending(null);
    }
  };

  const common =
    !(ctx && valid) || wrongNetwork || pending !== null || lookup.isLoading;
  const grantDisabled =
    common || holdsRole === true || (needsAck && !acceptSingleKey);
  const revokeDisabled = common || holdsRole === false;

  const lookupNote = describeLookup(lookup, valid, t);

  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle>{t('admin.title')}</CardTitle>
        <CardDescription>{t('admin.description')}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        <p
          className='flex items-start gap-2 border border-amber-500/40 border-dashed p-3 text-amber-800 text-xs dark:text-amber-200'
          role='note'
        >
          <ShieldAlert className='mt-0.5 size-4 shrink-0' />
          {isMainnetNetwork ? t('admin.warnMainnet') : t('admin.warnTestnet')}
        </p>

        <Field
          error={invalid ? t('err.address') : undefined}
          hint={lookupNote ?? t('admin.targetHint')}
          id='role-target'
          label={t('admin.target')}
        >
          <Input
            aria-describedby='role-target-note'
            aria-invalid={invalid}
            autoComplete='off'
            className='font-mono'
            id='role-target'
            onChange={(event) => setTarget(event.target.value)}
            placeholder='0x…'
            spellCheck={false}
            value={target}
          />
        </Field>

        {isSingleKey ? (
          <SingleKeyNotice
            accepted={acceptSingleKey}
            needsAck={needsAck}
            onAccept={setAcceptSingleKey}
            t={t}
          />
        ) : null}
        {isSelf ? (
          <p
            className='text-amber-700 text-sm dark:text-amber-300'
            role='alert'
          >
            {t('admin.selfWarning')}
          </p>
        ) : null}

        <div className='flex flex-wrap gap-2'>
          <Button
            disabled={grantDisabled}
            onClick={() => run('grantRole')}
            type='button'
          >
            {pending === 'grantRole' ? t('admin.sending') : t('admin.grant')}
          </Button>
          <Button
            disabled={revokeDisabled}
            onClick={() => run('revokeRole')}
            type='button'
            variant='outline'
          >
            {pending === 'revokeRole' ? t('admin.sending') : t('admin.revoke')}
          </Button>
        </div>

        <TxStatus
          error={error}
          hash={lastHash}
          t={t}
          wrongNetwork={wrongNetwork}
        />
      </CardContent>
    </Card>
  );
};
