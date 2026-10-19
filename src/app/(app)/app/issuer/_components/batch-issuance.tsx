'use client';

import { Download, Upload } from 'lucide-react';
import { type ChangeEvent, useMemo, useRef, useState } from 'react';
import type { Address } from 'viem';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { type TranslateFn, useT } from '@/lib/i18n';
import {
  type BatchChunk,
  buildChunks,
  canonicalSerial,
  hasErrors,
  isValidRecipient,
  MAX_CREDITS_PER_TX,
  parseCreditCsv,
} from '../_lib/issuer-utils';
import { type ChunkState, useBatchRunner } from '../_lib/use-batch-runner';
import {
  type ChainStatus,
  useIssuerTx,
  useSerialChainStatus,
} from '../_lib/use-issuer-data';
import { messages } from '../_messages';
import { ChunkTable } from './chunk-table';
import { Field } from './field';
import {
  analyzeRows,
  PreviewTable,
  type RowAnalysis,
  type RowChainStatus,
} from './preview-table';

interface BatchIssuanceProps {
  disabled: boolean;
  account: Address | undefined;
  onIssued: () => void;
}

const TEMPLATE_HEADER =
  'projectId,projectName,serialNumber,methodology,tonnes,vintageYear,geography,oracleProofHash,satelliteDataCID,tokenURI';
const TEMPLATE_EXAMPLE =
  'PROJECT-001,Example Reforestation,VCS-0000-0001,VERRA_VCS,100,2024,BR,0x<64 hex characters: SHA-256 of the evidence file>,,ipfs://<metadata CID>';
const TEMPLATE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(`${TEMPLATE_HEADER}\n${TEMPLATE_EXAMPLE}\n`)}`;

interface Progress {
  remaining: number;
  started: boolean;
  anyFailed: boolean;
  totalTonnes: number;
  /** CSV lines whose chunk is already confirmed onchain. */
  doneLines: Set<number>;
}

const summarize = (
  chunks: BatchChunk[],
  states: Record<number, ChunkState>
): Progress => {
  const doneLines = new Set<number>();
  let remaining = 0;
  let anyFailed = false;
  let totalTonnes = 0;
  for (const chunk of chunks) {
    const status = states[chunk.index]?.status;
    totalTonnes += chunk.totalTonnes;
    if (status === 'done') {
      for (const line of chunk.lines) {
        doneLines.add(line);
      }
    } else {
      remaining++;
    }
    anyFailed ||= status === 'failed';
  }
  return {
    remaining,
    started: chunks.length > 0 && remaining < chunks.length,
    anyFailed,
    totalTonnes,
    doneLines,
  };
};

const statusOfRow = (
  item: RowAnalysis,
  doneLines: Set<number>,
  chainStatus: Record<string, ChainStatus>
): RowChainStatus => {
  if (doneLines.has(item.row.line)) {
    return 'issued';
  }
  if (hasErrors(item.errors)) {
    return null;
  }
  return (
    chainStatus[canonicalSerial(item.row.draft.serialNumber)] ?? 'checking'
  );
};

const runLabel = (
  t: TranslateFn,
  running: boolean,
  progress: Progress,
  chunkCount: number
): string => {
  if (running) {
    return t('batch.running');
  }
  return progress.started || progress.anyFailed
    ? t('batch.resume', { count: progress.remaining })
    : t('batch.start', { count: chunkCount });
};

export const BatchIssuance = ({
  disabled,
  account,
  onIssued,
}: BatchIssuanceProps) => {
  const t = useT(messages);
  const { wrongNetwork } = useIssuerTx();
  const fileRef = useRef<HTMLInputElement>(null);

  const [recipient, setRecipient] = useState('');
  const [csvText, setCsvText] = useState('');

  const recipientValue = recipient.trim();
  const recipientValid = isValidRecipient(recipientValue);

  const parsed = useMemo(() => parseCreditCsv(csvText), [csvText]);
  const analysis = useMemo(() => analyzeRows(parsed.rows), [parsed.rows]);
  const rowsValid =
    analysis.length > 0 &&
    parsed.missingColumns.length === 0 &&
    analysis.every((item) => !(hasErrors(item.errors) || item.duplicateOf));

  const chunks = useMemo(
    () => (rowsValid ? buildChunks(analysis.map((item) => item.row)) : []),
    [rowsValid, analysis]
  );

  // Onchain duplicate check of every well-formed serial in the CSV (read-only).
  const serialsKey = useMemo(
    () =>
      JSON.stringify(
        analysis
          .filter((item) => !hasErrors(item.errors))
          .map((item) => item.row.draft.serialNumber.trim())
      ),
    [analysis]
  );
  const chainStatus = useSerialChainStatus(serialsKey);

  const runner = useBatchRunner({
    chunks,
    recipient: recipientValid ? (recipientValue as Address) : null,
    t,
    onIssued,
  });
  const { chunkStates, payloadKey, running } = runner;

  const progress = summarize(chunks, chunkStates);
  const statusOf = (item: RowAnalysis) =>
    statusOfRow(item, progress.doneLines, chainStatus);
  const rowsReady = analysis.every((item) => {
    const status = statusOf(item);
    return status === 'issued' || status === 'free';
  });

  const blocked = disabled || running || wrongNetwork || !runner.hasWallet;
  const inputsOk = recipientValid && rowsValid && rowsReady;
  const canRun =
    !blocked && inputsOk && payloadKey !== null && progress.remaining > 0;

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) {
      setCsvText(await file.text());
    }
  };

  const recipientError =
    recipientValue !== '' && !recipientValid ? t('err.address') : undefined;
  const showMissing = parsed.missingColumns.length > 0 && csvText.trim() !== '';

  return (
    <div className='space-y-5'>
      <fieldset
        className='space-y-5 disabled:opacity-60'
        disabled={disabled || running}
      >
        <legend className='sr-only'>{t('batch.title')}</legend>

        <Field
          error={recipientError}
          hint={t('batch.recipientHint')}
          id='batch-recipient'
          label={t('f.recipient')}
        >
          <div className='flex gap-2'>
            <Input
              aria-describedby='batch-recipient-note'
              aria-invalid={Boolean(recipientError)}
              autoComplete='off'
              className='font-mono'
              id='batch-recipient'
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

        <div className='space-y-1.5'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <label className='font-medium text-sm' htmlFor='batch-csv'>
              {t('batch.csv')}
            </label>
            <div className='flex flex-wrap gap-2'>
              <Button asChild size='sm' variant='outline'>
                <a download='carb-credits-template.csv' href={TEMPLATE_HREF}>
                  <Download />
                  {t('batch.template')}
                </a>
              </Button>
              <Button
                onClick={() => fileRef.current?.click()}
                size='sm'
                type='button'
                variant='outline'
              >
                <Upload />
                {t('batch.upload')}
              </Button>
              <input
                accept='.csv,.tsv,text/csv,text/tab-separated-values,text/plain'
                aria-label={t('batch.upload')}
                className='sr-only'
                onChange={handleFile}
                ref={fileRef}
                tabIndex={-1}
                type='file'
              />
            </div>
          </div>
          <Textarea
            aria-describedby='batch-csv-note'
            className='min-h-32 font-mono text-xs'
            id='batch-csv'
            onChange={(event) => setCsvText(event.target.value)}
            placeholder={TEMPLATE_HEADER}
            spellCheck={false}
            value={csvText}
          />
          <p className='text-muted-foreground text-xs' id='batch-csv-note'>
            {t('batch.csvNote', { max: MAX_CREDITS_PER_TX })}
          </p>
        </div>
      </fieldset>

      {showMissing ? (
        <p className='text-destructive text-sm' role='alert'>
          {t('batch.missingColumns', {
            columns: parsed.missingColumns.join(', '),
          })}
        </p>
      ) : null}
      {parsed.unknownColumns.length > 0 ? (
        <p className='text-muted-foreground text-xs'>
          {t('batch.unknownColumns', {
            columns: parsed.unknownColumns.join(', '),
          })}
        </p>
      ) : null}

      {analysis.length > 0 ? (
        <PreviewTable rows={analysis} statusOf={statusOf} t={t} />
      ) : null}

      {chunks.length > 0 ? (
        <ChunkTable
          chunks={chunks}
          states={chunkStates}
          t={t}
          totalCredits={analysis.length}
          totalTonnes={progress.totalTonnes}
        />
      ) : null}

      {analysis.length > 0 && !rowsValid ? (
        <p className='text-destructive text-sm' role='alert'>
          {t('batch.fixRows')}
        </p>
      ) : null}
      {wrongNetwork ? (
        <p className='text-amber-700 text-sm dark:text-amber-300' role='alert'>
          {t('common.wrongNetwork')}
        </p>
      ) : null}

      <div className='flex flex-wrap items-center gap-2'>
        <Button disabled={!canRun} onClick={runner.run} type='button'>
          {runLabel(t, running, progress, chunks.length)}
        </Button>
        {running ? (
          <Button onClick={runner.stop} type='button' variant='outline'>
            {t('batch.stop')}
          </Button>
        ) : null}
        {progress.started && !running ? (
          <Button onClick={runner.clearSaved} type='button' variant='ghost'>
            {t('batch.clearProgress')}
          </Button>
        ) : null}
      </div>
    </div>
  );
};
