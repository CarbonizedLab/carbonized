'use client';

import { Award, ExternalLink, Flame, TriangleAlert, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useContractInteraction } from '@/hooks/use-contract-interaction';
import { formatCarbonTonnes } from '@/lib/carb-format';
import { explorerTxUrl } from '@/lib/explorer';
import { useT } from '@/lib/i18n';
import { certificatePath, MAX_RETIRE_BATCH } from '@/lib/retirement';
import type { CarbonCredit } from '@/types/carb';
import { messages } from '../_messages';

const MIN_REASON_LENGTH = 3;

type Phase =
  | { name: 'form' }
  | { name: 'pending' }
  | { name: 'done'; hash: `0x${string}` };

interface RetireDialogProps {
  /** Credits to retire; `null` closes the dialog. */
  credits: CarbonCredit[] | null;
  onClose: () => void;
  /** Called after a successful onchain retirement so the caller can refresh. */
  onRetired: () => void;
}

/** Retires NFT credits onchain (burns them) and links to the resulting certificate. */
export const RetireDialog = ({
  credits,
  onClose,
  onRetired,
}: RetireDialogProps) => {
  const t = useT(messages);
  const { retireCredits } = useContractInteraction();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [phase, setPhase] = useState<Phase>({ name: 'form' });
  const [error, setError] = useState<string | null>(null);

  const isOpen = credits !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (isOpen && !dialog.open) {
      dialog.showModal();
      setReason('');
      setAcknowledged(false);
      setPhase({ name: 'form' });
      setError(null);
    }
    if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  const list = credits ?? [];
  const totalTonnes = list.reduce((sum, c) => sum + c.co2Tonnes, 0);
  const tooMany = list.length > MAX_RETIRE_BATCH;
  const canSubmit =
    reason.trim().length >= MIN_REASON_LENGTH &&
    acknowledged &&
    !tooMany &&
    phase.name === 'form';

  const handleSubmit = async () => {
    setError(null);
    setPhase({ name: 'pending' });
    try {
      const hash = await retireCredits(
        list.map((c) => BigInt(c.tokenId)),
        reason
      );
      setPhase({ name: 'done', hash });
      toast.success(t('retire.success'));
      onRetired();
    } catch (err) {
      const message = err instanceof Error ? err.message : t('retire.failed');
      setError(message);
      setPhase({ name: 'form' });
      toast.error(message);
    }
  };

  const handleClose = () => {
    if (phase.name !== 'pending') {
      onClose();
    }
  };

  return (
    <dialog
      aria-labelledby='retire-dialog-title'
      className='m-auto w-full max-w-lg border border-dashed bg-background p-0 text-foreground backdrop:bg-black/70 backdrop:backdrop-blur-sm'
      onCancel={(event) => {
        if (phase.name === 'pending') {
          event.preventDefault();
        }
      }}
      onClose={onClose}
      ref={dialogRef}
    >
      {credits ? (
        <div className='space-y-5 p-6'>
          <div className='flex items-start justify-between gap-3'>
            <div>
              <h2
                className='flex items-center gap-2 font-semibold text-2xl tracking-tight'
                id='retire-dialog-title'
              >
                <Flame className='size-6 text-amber-600 dark:text-amber-400' />
                {phase.name === 'done'
                  ? t('retire.titleDone')
                  : t('retire.title')}
              </h2>
              <p className='text-muted-foreground text-sm'>
                {t(list.length === 1 ? 'retire.countOne' : 'retire.countMany', {
                  count: list.length,
                  tonnes: formatCarbonTonnes(totalTonnes),
                })}
              </p>
            </div>
            <Button
              aria-label={t('retire.close')}
              disabled={phase.name === 'pending'}
              onClick={handleClose}
              size='icon'
              type='button'
              variant='ghost'
            >
              <X />
            </Button>
          </div>

          <ul className='max-h-40 space-y-1 overflow-y-auto border border-dashed p-3 text-sm'>
            {list.map((c) => (
              <li className='flex justify-between gap-3' key={c.tokenId}>
                <span className='truncate'>
                  <span className='font-mono text-muted-foreground'>
                    #{c.tokenId}
                  </span>{' '}
                  {c.projectName}
                </span>
                <span className='shrink-0 font-medium'>
                  {formatCarbonTonnes(c.co2Tonnes)}
                </span>
              </li>
            ))}
          </ul>

          {phase.name === 'done' ? (
            <div className='space-y-3'>
              <Alert className='rounded-none border-emerald-500/50 border-dashed text-emerald-700 dark:text-emerald-300'>
                <Award />
                <AlertDescription>{t('retire.doneMessage')}</AlertDescription>
              </Alert>
              <div className='flex flex-wrap gap-2'>
                <Button asChild>
                  <Link
                    href={certificatePath(
                      phase.hash,
                      BigInt(list[0]?.tokenId ?? 0)
                    )}
                  >
                    <Award />
                    {t('retire.viewCertificate')}
                  </Link>
                </Button>
                <Button asChild variant='outline'>
                  <a
                    href={explorerTxUrl(phase.hash)}
                    rel='noopener noreferrer'
                    target='_blank'
                  >
                    <ExternalLink />
                    {t('retire.transaction')}
                  </a>
                </Button>
                <Button onClick={onClose} type='button' variant='ghost'>
                  {t('retire.done')}
                </Button>
              </div>
            </div>
          ) : (
            <form
              className='space-y-4'
              onSubmit={(event) => {
                event.preventDefault();
                handleSubmit();
              }}
            >
              <div className='space-y-2'>
                <Label htmlFor='retire-reason'>{t('retire.reasonLabel')}</Label>
                <Textarea
                  disabled={phase.name === 'pending'}
                  id='retire-reason'
                  maxLength={200}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={t('retire.reasonPlaceholder')}
                  required
                  rows={3}
                  value={reason}
                />
                <p className='text-muted-foreground text-xs'>
                  {t('retire.reasonHint')}
                </p>
              </div>

              <Alert className='rounded-none border-amber-500/50 border-dashed text-amber-700 dark:text-amber-300'>
                <TriangleAlert />
                <AlertDescription>{t('retire.warning')}</AlertDescription>
              </Alert>

              <label
                className='flex items-start gap-2 text-sm'
                htmlFor='retire-ack'
              >
                <input
                  checked={acknowledged}
                  className='mt-1 size-4 accent-primary'
                  disabled={phase.name === 'pending'}
                  id='retire-ack'
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  type='checkbox'
                />
                <span>{t('retire.acknowledge')}</span>
              </label>

              {tooMany ? (
                <p className='text-destructive text-sm' role='alert'>
                  {t('retire.tooMany', { max: MAX_RETIRE_BATCH })}
                </p>
              ) : null}
              {error ? (
                <p className='text-destructive text-sm' role='alert'>
                  {error}
                </p>
              ) : null}

              <div className='flex gap-3'>
                <Button
                  disabled={phase.name === 'pending'}
                  onClick={handleClose}
                  type='button'
                  variant='secondary'
                >
                  {t('retire.cancel')}
                </Button>
                <Button className='flex-1' disabled={!canSubmit} type='submit'>
                  <Flame />
                  {phase.name === 'pending'
                    ? t('retire.confirmInWallet')
                    : t('retire.submit')}
                </Button>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </dialog>
  );
};
