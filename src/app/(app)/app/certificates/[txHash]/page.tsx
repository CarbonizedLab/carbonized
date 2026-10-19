'use client';

import { ArrowLeft, SearchX } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { EmptyState } from '@/components/app/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/lib/i18n';
import { isTxHash } from '@/lib/retirement';
import { VerifiedCertificate } from '../_components/verified-certificate';
import { messages } from '../_messages';

const TX_HASH_PARAM = 'txHash';

const VerifyContent = () => {
  const t = useT(messages);
  const params = useParams<{ [TX_HASH_PARAM]: string }>();
  const searchParams = useSearchParams();
  const txHash = params[TX_HASH_PARAM];

  if (!isTxHash(txHash)) {
    return (
      <EmptyState
        description={t('verify.badHash.description')}
        icon={<SearchX className='size-12' />}
        title={t('verify.badHash.title')}
      />
    );
  }
  return (
    <VerifiedCertificate
      tokenId={searchParams.get('token') ?? undefined}
      txHash={txHash}
    />
  );
};

/** Public route: anyone can verify a retirement from its transaction hash alone. */
const VerifyCertificatePage = () => {
  const t = useT(messages);
  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h1 className='font-semibold text-2xl tracking-tight'>
            {t('verify.title')}
          </h1>
          <p className='max-w-2xl text-muted-foreground'>
            {t('verify.subtitle')}
          </p>
        </div>
        <Button asChild variant='outline'>
          <Link href='/app/certificates'>
            <ArrowLeft />
            {t('verify.back')}
          </Link>
        </Button>
      </div>
      <Suspense fallback={<Skeleton className='h-96 rounded-none' />}>
        <VerifyContent />
      </Suspense>
    </div>
  );
};

export default VerifyCertificatePage;
