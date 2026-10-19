'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { formatAddress } from '@/lib/carb-format';
import type { TranslateFn } from '@/lib/i18n';

const COPIED_RESET_MS = 1500;

interface AddressCopyProps {
  address: string;
  isYou: boolean;
  t: TranslateFn;
}

/** Short address with a copy-to-clipboard button. */
export const AddressCopy = ({ address, isYou, t }: AddressCopyProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      toast.error(t('address.copyFailed'));
    }
  };

  return (
    <span className='inline-flex items-center gap-1.5'>
      <span className='font-mono text-xs' title={address}>
        {formatAddress(address)}
      </span>
      {isYou ? (
        <span className='border border-primary/40 px-1 text-[10px] text-primary uppercase'>
          {t('address.you')}
        </span>
      ) : null}
      <button
        aria-label={t('address.copy')}
        className='text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        onClick={handleCopy}
        title={t('address.copy')}
        type='button'
      >
        {copied ? (
          <Check className='size-3.5 text-emerald-600 dark:text-emerald-400' />
        ) : (
          <Copy className='size-3.5' />
        )}
      </button>
    </span>
  );
};
