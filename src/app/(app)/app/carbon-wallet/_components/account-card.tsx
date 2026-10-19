import { Award, Check, Copy, Shield } from 'lucide-react';
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { formatAddress } from '@/lib/carb-format';
import { useT } from '@/lib/i18n';
import { messages } from '../_messages';
import { SUCCESS_TEXT } from './wallet-styles';

const COPIED_RESET_MS = 2000;

interface AccountCardProps {
  address: string;
  accountNumber: string;
}

export const AccountCard = ({ address, accountNumber }: AccountCardProps) => {
  const t = useT(messages);
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_RESET_MS);
  };

  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardContent className='space-y-2'>
        <div className='flex items-center gap-2 text-primary'>
          <Award className='size-4' />
          <span className='font-semibold text-xs uppercase tracking-wider'>
            {t('account.title')}
          </span>
        </div>
        <p className='font-bold font-mono text-lg'>{accountNumber}</p>
        <div className='flex items-center gap-2'>
          <p className='truncate font-mono text-muted-foreground text-sm'>
            {formatAddress(address, 6)}
          </p>
          <button
            aria-label={t('account.copyAddress')}
            className='text-muted-foreground hover:text-foreground'
            onClick={copyAddress}
            type='button'
          >
            {copied ? (
              <Check className={`size-3.5 ${SUCCESS_TEXT}`} />
            ) : (
              <Copy className='size-3.5' />
            )}
          </button>
        </div>
        <div className='flex items-center gap-1.5 text-muted-foreground text-xs'>
          <Shield className='size-3.5' />
          <span>{t('account.authorized')}</span>
        </div>
      </CardContent>
    </Card>
  );
};
