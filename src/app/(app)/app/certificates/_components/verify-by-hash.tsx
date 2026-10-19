'use client';

import { ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/lib/i18n';
import { certificatePath, isTxHash } from '@/lib/retirement';
import { messages } from '../_messages';

/** Opens the public verification route for any retirement transaction hash. */
export const VerifyByHash = () => {
  const t = useT(messages);
  const router = useRouter();
  const [value, setValue] = useState('');
  const trimmed = value.trim();
  const invalid = trimmed.length > 0 && !isTxHash(trimmed);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (isTxHash(trimmed)) {
      router.push(certificatePath(trimmed));
    }
  };

  return (
    <form
      className='space-y-2 border border-dashed p-4'
      onSubmit={handleSubmit}
    >
      <Label htmlFor='verify-hash'>{t('verifyBox.label')}</Label>
      <div className='flex flex-col gap-2 sm:flex-row'>
        <Input
          aria-describedby='verify-hash-hint'
          aria-invalid={invalid}
          className='font-mono'
          id='verify-hash'
          onChange={(event) => setValue(event.target.value)}
          placeholder='0x…'
          value={value}
        />
        <Button disabled={!isTxHash(trimmed)} type='submit' variant='outline'>
          <ShieldCheck />
          {t('verifyBox.action')}
        </Button>
      </div>
      <p
        className={
          invalid ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'
        }
        id='verify-hash-hint'
      >
        {invalid ? t('verifyBox.invalid') : t('verifyBox.hint')}
      </p>
    </form>
  );
};
