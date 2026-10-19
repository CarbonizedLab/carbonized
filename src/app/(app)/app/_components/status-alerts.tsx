'use client';

import { AlertTriangle, PlugZap } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useT } from '@/lib/i18n';
import { messages } from '../_messages';

interface StatusAlertsProps {
  contractsConfigured: boolean;
  errors: string[];
}

export const StatusAlerts = ({
  contractsConfigured,
  errors,
}: StatusAlertsProps) => {
  const t = useT(messages);

  if (contractsConfigured && errors.length === 0) {
    return null;
  }

  return (
    <div className='space-y-3'>
      {contractsConfigured ? null : (
        <Alert className='rounded-none border-dashed' variant='destructive'>
          <PlugZap />
          <AlertTitle>{t('alert.config.title')}</AlertTitle>
          <AlertDescription>{t('alert.config.desc')}</AlertDescription>
        </Alert>
      )}
      {errors.length > 0 ? (
        <Alert className='rounded-none border-dashed'>
          <AlertTriangle />
          <AlertTitle>{t('alert.errors.title')}</AlertTitle>
          <AlertDescription>
            <p>{t('alert.errors.desc')}</p>
            <ul className='mt-1 list-inside list-disc break-all text-xs'>
              {errors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
};
