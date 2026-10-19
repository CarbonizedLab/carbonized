'use client';

import { Leaf } from 'lucide-react';
import Link from 'next/link';
import { EmptyState } from '@/components/app/empty-state';
import { Button } from '@/components/ui/button';
import type { TranslateFn } from '@/lib/i18n';

/** Empty state pointing to company registration or a credit request. */
export const NoCredits = ({ t }: { t: TranslateFn }) => (
  <EmptyState
    action={
      <div className='flex flex-wrap justify-center gap-3'>
        <Button asChild variant='outline'>
          <Link href='/app/company/register'>{t('empty.register')}</Link>
        </Button>
        <Button asChild variant='ghost'>
          <Link href='/app/credit-requests'>{t('empty.request')}</Link>
        </Button>
        <Button asChild variant='ghost'>
          <Link href='/app/issuer'>{t('empty.issuer')}</Link>
        </Button>
      </div>
    }
    description={t('empty.description')}
    icon={<Leaf className='size-12' />}
    title={t('empty.title')}
  />
);
