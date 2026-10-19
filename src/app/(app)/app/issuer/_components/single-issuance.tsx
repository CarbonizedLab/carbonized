'use client';

import { ExternalLink, FileCheck2 } from 'lucide-react';
import { type ChangeEvent, type FormEvent, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { Address } from 'viem';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { explorerTxUrl } from '@/lib/explorer';
import { useT } from '@/lib/i18n';
import { sendMintCredit } from '../_lib/issuer-chain';
import {
  type CreditDraft,
  canonicalSerial,
  type DraftField,
  EMPTY_DRAFT,
  hasErrors,
  isValidRecipient,
  MAX_TONNES_PER_CREDIT,
  MAX_VINTAGE_YEAR,
  METHODOLOGIES,
  MIN_VINTAGE_YEAR,
  sha256OfFile,
  toCreditData,
  validateDraft,
} from '../_lib/issuer-utils';
import { useIssuerTx, useSerialCheck } from '../_lib/use-issuer-data';
import { messages } from '../_messages';
import { Field } from './field';

interface SingleIssuanceProps {
  /** Form is visible but inert unless the wallet holds NATIVE_ISSUER_ROLE. */
  disabled: boolean;
  account: Address | undefined;
  onIssued: () => void;
}

type Phase = 'idle' | 'signing' | 'confirming';

interface IssuedResult {
  hash: `0x${string}`;
  tokenId: bigint | undefined;
}

const KEEP_ON_RESET: DraftField[] = [
  'projectId',
  'projectName',
  'methodology',
  'vintageYear',
  'geography',
];

const BYTES_PER_KIB = 1024;

export const SingleIssuance = ({
  disabled,
  account,
  onIssued,
}: SingleIssuanceProps) => {
  const t = useT(messages);
  const { ctx, wrongNetwork } = useIssuerTx();
  const fileRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<CreditDraft>(EMPTY_DRAFT);
  const [recipient, setRecipient] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<IssuedResult | null>(null);
  const [hashing, setHashing] = useState(false);
  const [evidence, setEvidence] = useState<{
    name: string;
    size: number;
  } | null>(null);

  const serialStatus = useSerialCheck(draft.serialNumber);
  const errors = validateDraft(draft);
  const recipientValue = recipient.trim();
  const recipientInvalid =
    recipientValue !== '' && !isValidRecipient(recipientValue);
  const busy = phase !== 'idle';

  const fieldError = (field: DraftField): string | undefined => {
    const code = errors[field];
    if (!code) {
      return;
    }
    if (code === 'required' && !attempted) {
      return;
    }
    return t(`err.${code}`, {
      max: MAX_TONNES_PER_CREDIT.toLocaleString('en-US'),
      minYear: MIN_VINTAGE_YEAR,
      maxYear: MAX_VINTAGE_YEAR,
    });
  };

  const recipientError = (): string | undefined => {
    if (recipientInvalid) {
      return t('err.address');
    }
    return attempted && recipientValue === '' ? t('err.required') : undefined;
  };

  const setField =
    (field: DraftField) => (event: ChangeEvent<HTMLInputElement>) => {
      const { value } = event.target;
      setDraft((previous) => ({ ...previous, [field]: value }));
    };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    setHashing(true);
    try {
      const hash = await sha256OfFile(file);
      setDraft((previous) => ({ ...previous, oracleProofHash: hash }));
      setEvidence({ name: file.name, size: file.size });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('evidence.failed')
      );
    } finally {
      setHashing(false);
    }
  };

  const serialBlocksSubmit =
    serialStatus === 'taken' || serialStatus === 'checking';
  const canSubmit =
    !(disabled || busy || wrongNetwork || serialBlocksSubmit || hashing) &&
    confirmed;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    const formInvalid =
      hasErrors(errors) || recipientValue === '' || recipientInvalid;
    if (!(ctx && canSubmit) || formInvalid) {
      return;
    }
    setSubmitError(null);
    setResult(null);
    setPhase('signing');
    try {
      const minted = await sendMintCredit(
        ctx,
        {
          to: recipientValue as Address,
          projectId: draft.projectId.trim(),
          data: toCreditData(draft),
        },
        () => setPhase('confirming')
      );
      setResult({
        hash: minted.receipt.transactionHash,
        tokenId: minted.tokenIds[0],
      });
      toast.success(t('single.success'));
      setDraft((previous) => {
        const next = { ...EMPTY_DRAFT };
        for (const field of KEEP_ON_RESET) {
          next[field] = previous[field];
        }
        return next;
      });
      setEvidence(null);
      setConfirmed(false);
      setAttempted(false);
      onIssued();
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : t('single.failed')
      );
    } finally {
      setPhase('idle');
    }
  };

  const submitLabel = () => {
    if (phase === 'signing') {
      return t('single.signing');
    }
    return phase === 'confirming' ? t('single.confirming') : t('single.submit');
  };

  const serialKey = canonicalSerial(draft.serialNumber);

  return (
    <form className='space-y-5' noValidate onSubmit={handleSubmit}>
      <fieldset
        className='space-y-5 disabled:opacity-60'
        disabled={disabled || busy}
      >
        <legend className='sr-only'>{t('single.title')}</legend>

        <div className='grid gap-4 sm:grid-cols-2'>
          <Field
            error={recipientError()}
            hint={t('single.recipientHint')}
            id='issue-recipient'
            label={t('f.recipient')}
          >
            <div className='flex gap-2'>
              <Input
                aria-describedby='issue-recipient-note'
                aria-invalid={Boolean(recipientError())}
                autoComplete='off'
                className='font-mono'
                id='issue-recipient'
                onChange={(event) => setRecipient(event.target.value)}
                placeholder='0x…'
                spellCheck={false}
                value={recipient}
              />
              <Button
                disabled={!account}
                onClick={() => account && setRecipient(account)}
                type='button'
                variant='outline'
              >
                {t('single.useMine')}
              </Button>
            </div>
          </Field>
          <Field
            error={fieldError('methodology')}
            hint={t('h.methodology')}
            id='issue-methodology'
            label={t('f.methodology')}
          >
            <Select
              onValueChange={(value) =>
                setDraft((previous) => ({ ...previous, methodology: value }))
              }
              value={draft.methodology}
            >
              <SelectTrigger
                aria-describedby='issue-methodology-note'
                className='w-full'
                id='issue-methodology'
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHODOLOGIES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className='grid gap-4 sm:grid-cols-2'>
          <Field
            error={fieldError('projectId')}
            hint={t('h.projectId')}
            id='issue-project-id'
            label={t('f.projectId')}
          >
            <Input
              aria-describedby='issue-project-id-note'
              aria-invalid={Boolean(fieldError('projectId'))}
              id='issue-project-id'
              onChange={setField('projectId')}
              value={draft.projectId}
            />
          </Field>
          <Field
            error={fieldError('projectName')}
            id='issue-project-name'
            label={t('f.projectName')}
          >
            <Input
              aria-describedby='issue-project-name-note'
              aria-invalid={Boolean(fieldError('projectName'))}
              id='issue-project-name'
              onChange={setField('projectName')}
              value={draft.projectName}
            />
          </Field>
        </div>

        <Field
          error={fieldError('serialNumber')}
          hint={t('h.serial')}
          id='issue-serial'
          label={t('f.serial')}
        >
          <Input
            aria-describedby='issue-serial-note issue-serial-status'
            aria-invalid={
              Boolean(fieldError('serialNumber')) || serialStatus === 'taken'
            }
            autoComplete='off'
            className='font-mono'
            id='issue-serial'
            onChange={setField('serialNumber')}
            spellCheck={false}
            value={draft.serialNumber}
          />
          <p
            aria-live='polite'
            className={
              serialStatus === 'taken'
                ? 'text-destructive text-xs'
                : 'text-muted-foreground text-xs'
            }
            id='issue-serial-status'
          >
            {serialStatus === 'idle' ? null : (
              <>
                {t('serial.canonical', { key: serialKey })} ·{' '}
                {t(`serial.${serialStatus}`)}
              </>
            )}
          </p>
        </Field>

        <div className='grid gap-4 sm:grid-cols-3'>
          <Field
            error={fieldError('tonnes')}
            hint={t('h.tonnes', {
              max: MAX_TONNES_PER_CREDIT.toLocaleString('en-US'),
            })}
            id='issue-tonnes'
            label={t('f.tonnes')}
          >
            <Input
              aria-describedby='issue-tonnes-note'
              aria-invalid={Boolean(fieldError('tonnes'))}
              id='issue-tonnes'
              inputMode='numeric'
              onChange={setField('tonnes')}
              value={draft.tonnes}
            />
          </Field>
          <Field
            error={fieldError('vintageYear')}
            id='issue-vintage'
            label={t('f.vintage')}
          >
            <Input
              aria-describedby='issue-vintage-note'
              aria-invalid={Boolean(fieldError('vintageYear'))}
              id='issue-vintage'
              inputMode='numeric'
              maxLength={4}
              onChange={setField('vintageYear')}
              value={draft.vintageYear}
            />
          </Field>
          <Field
            error={fieldError('geography')}
            hint={t('h.geography')}
            id='issue-geography'
            label={t('f.geography')}
          >
            <Input
              aria-describedby='issue-geography-note'
              aria-invalid={Boolean(fieldError('geography'))}
              id='issue-geography'
              onChange={setField('geography')}
              value={draft.geography}
            />
          </Field>
        </div>

        <Field
          error={fieldError('oracleProofHash')}
          hint={t('h.proof')}
          id='issue-proof'
          label={t('f.proof')}
        >
          <div className='flex gap-2'>
            <Input
              aria-describedby='issue-proof-note'
              aria-invalid={Boolean(fieldError('oracleProofHash'))}
              autoComplete='off'
              className='font-mono'
              id='issue-proof'
              onChange={setField('oracleProofHash')}
              placeholder='0x…'
              spellCheck={false}
              value={draft.oracleProofHash}
            />
            <Button
              disabled={hashing}
              onClick={() => fileRef.current?.click()}
              type='button'
              variant='outline'
            >
              <FileCheck2 />
              {hashing ? t('evidence.hashing') : t('evidence.button')}
            </Button>
            <input
              aria-label={t('evidence.button')}
              className='sr-only'
              onChange={handleFile}
              ref={fileRef}
              tabIndex={-1}
              type='file'
            />
          </div>
          <p className='text-muted-foreground text-xs'>
            {evidence
              ? t('evidence.done', {
                  name: evidence.name,
                  kib: Math.max(1, Math.round(evidence.size / BYTES_PER_KIB)),
                })
              : t('evidence.note')}
          </p>
        </Field>

        <div className='grid gap-4 sm:grid-cols-2'>
          <Field
            error={fieldError('satelliteDataCID')}
            hint={t('h.cid')}
            id='issue-cid'
            label={t('f.cid')}
          >
            <Input
              aria-describedby='issue-cid-note'
              aria-invalid={Boolean(fieldError('satelliteDataCID'))}
              autoComplete='off'
              className='font-mono'
              id='issue-cid'
              onChange={setField('satelliteDataCID')}
              spellCheck={false}
              value={draft.satelliteDataCID}
            />
          </Field>
          <Field
            error={fieldError('tokenURI')}
            hint={t('h.uri')}
            id='issue-uri'
            label={t('f.uri')}
          >
            <Input
              aria-describedby='issue-uri-note'
              aria-invalid={Boolean(fieldError('tokenURI'))}
              autoComplete='off'
              id='issue-uri'
              onChange={setField('tokenURI')}
              placeholder='ipfs://…'
              spellCheck={false}
              value={draft.tokenURI}
            />
          </Field>
        </div>

        <label className='flex items-start gap-2 text-sm'>
          <input
            checked={confirmed}
            className='mt-1 size-4 accent-primary'
            onChange={(event) => setConfirmed(event.target.checked)}
            type='checkbox'
          />
          <span>{t('single.confirm')}</span>
        </label>
      </fieldset>

      {wrongNetwork ? (
        <p className='text-amber-700 text-sm dark:text-amber-300' role='alert'>
          {t('common.wrongNetwork')}
        </p>
      ) : null}
      {submitError ? (
        <p className='text-destructive text-sm' role='alert'>
          {submitError}
        </p>
      ) : null}
      {result ? (
        <output className='block text-emerald-700 text-sm dark:text-emerald-300'>
          {result.tokenId === undefined
            ? t('single.issuedNoId')
            : t('single.issued', { id: result.tokenId.toString() })}{' '}
          <a
            className='inline-flex items-center gap-1 underline'
            href={explorerTxUrl(result.hash)}
            rel='noopener noreferrer'
            target='_blank'
          >
            {t('common.viewTx')}
            <ExternalLink className='size-3' />
          </a>
        </output>
      ) : null}

      <Button disabled={!canSubmit} type='submit'>
        {submitLabel()}
      </Button>
    </form>
  );
};
