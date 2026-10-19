'use client';

import {
  CheckCircle2,
  Circle,
  Copy,
  Download,
  FileUp,
  Loader2,
  Trash2,
} from 'lucide-react';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatChainDate } from '@/lib/chain-format';
import { useLocaleStore, useT } from '@/lib/i18n';
import {
  KYB_DOCUMENTS,
  type KybDocumentId,
  type KybEntry,
  type KybState,
  loadKyb,
  MAX_KYB_FILE_BYTES,
  saveKyb,
  sha256Hex,
} from '../_lib/kyb-storage';
import { messages } from '../_messages';

const KB = 1024;
const MB = KB * KB;
const MS_PER_SECOND = 1000;

const formatSize = (bytes: number): string =>
  bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.ceil(bytes / KB)} KB`;

interface DocumentRowProps {
  id: KybDocumentId;
  entry: KybEntry | undefined;
  busy: boolean;
  onFile: (id: KybDocumentId, file: File) => void;
  onRemove: (id: KybDocumentId) => void;
}

const DocumentRow = ({
  id,
  entry,
  busy,
  onFile,
  onRemove,
}: DocumentRowProps) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) {
      onFile(id, file);
    }
  };

  const copyHash = async () => {
    if (!entry) {
      return;
    }
    try {
      await navigator.clipboard.writeText(entry.sha256);
      toast.success(t('kyb.hashCopied'));
    } catch {
      toast.error(t('common.copyFailed'));
    }
  };

  return (
    <li className='space-y-2 border border-dashed p-4'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='flex items-start gap-3'>
          {entry ? (
            <CheckCircle2 className='mt-0.5 size-5 text-emerald-600 dark:text-emerald-400' />
          ) : (
            <Circle className='mt-0.5 size-5 text-muted-foreground' />
          )}
          <div>
            <p className='font-medium'>{t(`kyb.doc.${id}`)}</p>
            <p className='text-muted-foreground text-xs'>
              {t(`kyb.doc.${id}.hint`)}
            </p>
          </div>
        </div>
        <div className='flex items-center gap-2'>
          <Badge
            className='rounded-none'
            variant={entry ? 'default' : 'outline'}
          >
            {entry ? t('kyb.status.hashed') : t('kyb.status.pending')}
          </Badge>
          <input
            accept='.pdf,.png,.jpg,.jpeg,.doc,.docx'
            aria-label={t('kyb.chooseFor', { doc: t(`kyb.doc.${id}`) })}
            className='sr-only'
            onChange={handleChange}
            ref={inputRef}
            tabIndex={-1}
            type='file'
          />
          <Button
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            size='sm'
            type='button'
            variant='outline'
          >
            {busy ? <Loader2 className='animate-spin' /> : <FileUp />}
            {entry ? t('kyb.replace') : t('kyb.choose')}
          </Button>
          {entry ? (
            <Button
              aria-label={t('kyb.remove')}
              onClick={() => onRemove(id)}
              size='icon'
              type='button'
              variant='ghost'
            >
              <Trash2 />
            </Button>
          ) : null}
        </div>
      </div>
      {entry ? (
        <dl className='grid gap-1 text-xs sm:grid-cols-[auto_1fr] sm:gap-x-3'>
          <dt className='text-muted-foreground'>{t('kyb.file')}</dt>
          <dd className='break-all'>
            {entry.fileName} · {formatSize(entry.size)}
          </dd>
          <dt className='text-muted-foreground'>SHA-256</dt>
          <dd className='flex items-start gap-1'>
            <span className='break-all font-mono'>{entry.sha256}</span>
            <Button
              aria-label={t('kyb.copyHash')}
              className='size-6 shrink-0'
              onClick={copyHash}
              size='icon'
              type='button'
              variant='ghost'
            >
              <Copy className='size-3' />
            </Button>
          </dd>
          <dt className='text-muted-foreground'>{t('kyb.hashedAt')}</dt>
          <dd>
            {formatChainDate(
              Math.floor(new Date(entry.hashedAt).getTime() / MS_PER_SECOND),
              locale
            )}
          </dd>
        </dl>
      ) : null}
    </li>
  );
};

/** Local-only KYB document checklist: documents are hashed in the browser and never uploaded. */
export const KybChecklist = ({ account }: { account: string }) => {
  const t = useT(messages);
  const [state, setState] = useState<KybState>({});
  const [busyId, setBusyId] = useState<KybDocumentId | null>(null);

  useEffect(() => {
    setState(loadKyb(account));
  }, [account]);

  const done = KYB_DOCUMENTS.filter((id) => state[id]).length;

  const update = (next: KybState) => {
    setState(next);
    saveKyb(account, next);
  };

  const handleFile = async (id: KybDocumentId, file: File) => {
    if (file.size > MAX_KYB_FILE_BYTES) {
      toast.error(t('kyb.tooLarge', { max: formatSize(MAX_KYB_FILE_BYTES) }));
      return;
    }
    setBusyId(id);
    try {
      const sha256 = await sha256Hex(file);
      update({
        ...state,
        [id]: {
          fileName: file.name,
          size: file.size,
          sha256,
          hashedAt: new Date().toISOString(),
        },
      });
      toast.success(t('kyb.hashed', { doc: t(`kyb.doc.${id}`) }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('kyb.hashFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = (id: KybDocumentId) => {
    const next: KybState = {};
    for (const docId of KYB_DOCUMENTS) {
      const entry = state[docId];
      if (docId !== id && entry) {
        next[docId] = entry;
      }
    }
    update(next);
  };

  const exportSummary = () => {
    const payload = {
      wallet: account,
      generatedAt: new Date().toISOString(),
      algorithm: 'SHA-256',
      documents: KYB_DOCUMENTS.flatMap((id) =>
        state[id] ? [{ type: id, ...state[id] }] : []
      ),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `carb-kyb-hashes-${account.slice(0, 8)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle>{t('kyb.title')}</CardTitle>
        <CardDescription>{t('kyb.description')}</CardDescription>
        <div className='space-y-1 pt-2'>
          <div
            aria-label={t('kyb.progress', {
              done,
              total: KYB_DOCUMENTS.length,
            })}
            aria-valuemax={KYB_DOCUMENTS.length}
            aria-valuemin={0}
            aria-valuenow={done}
            className='h-2 w-full bg-muted'
            role='progressbar'
          >
            <div
              className='h-full bg-primary transition-all'
              style={{ width: `${(done / KYB_DOCUMENTS.length) * 100}%` }}
            />
          </div>
          <p className='text-muted-foreground text-xs'>
            {t('kyb.progress', { done, total: KYB_DOCUMENTS.length })}
          </p>
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        <p className='border border-amber-500/40 border-dashed bg-amber-500/5 p-3 text-amber-800 text-xs dark:text-amber-300'>
          {t('kyb.localNotice')}
        </p>
        <ul className='space-y-3'>
          {KYB_DOCUMENTS.map((id) => (
            <DocumentRow
              busy={busyId === id}
              entry={state[id]}
              id={id}
              key={id}
              onFile={handleFile}
              onRemove={handleRemove}
            />
          ))}
        </ul>
        <Button
          disabled={done === 0}
          onClick={exportSummary}
          type='button'
          variant='outline'
        >
          <Download />
          {t('kyb.export')}
        </Button>
      </CardContent>
    </Card>
  );
};
