'use client';

import {
  AlertTriangle,
  BadgeCheck,
  Copy,
  ExternalLink,
  Printer,
  SearchX,
  TriangleAlert,
} from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { Hash } from 'viem';
import { usePublicClient } from 'wagmi';
import { EmptyState } from '@/components/app/empty-state';
import { PrintPortal } from '@/components/app/print-portal';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { explorerTxUrl } from '@/lib/explorer';
import { useT } from '@/lib/i18n';
import { isMainnetNetwork } from '@/lib/network';
import {
  certificatePath,
  type RetirementCertificateData,
  type RetirementVerification,
  verifyRetirementTx,
} from '@/lib/retirement';
import { messages } from '../_messages';
import { RetirementCertificateView } from './retirement-certificate';

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; result: RetirementVerification };

const useVerification = (txHash: Hash): LoadState => {
  const client = usePublicClient();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    if (!client) {
      return;
    }
    let cancelled = false;
    setState({ status: 'loading' });
    verifyRetirementTx(client, txHash)
      .then((result) => {
        if (!cancelled) {
          setState({ status: 'done', result });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, txHash]);

  return state;
};

const useOrigin = (): string => {
  const [origin, setOrigin] = useState('');
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  return origin;
};

interface CertificateBodyProps {
  certificates: RetirementCertificateData[];
  initialTokenId?: string;
}

const CertificateBody = ({
  certificates,
  initialTokenId,
}: CertificateBodyProps) => {
  const t = useT(messages);
  const origin = useOrigin();
  const [selected, setSelected] = useState(
    Math.max(
      0,
      certificates.findIndex((c) => c.tokenId.toString() === initialTokenId)
    )
  );
  const certificate = certificates[selected] ?? certificates[0];
  const verificationUrl =
    origin && certificate
      ? `${origin}${certificatePath(certificate.txHash, certificate.tokenId)}`
      : '';

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(verificationUrl);
      toast.success(t('actions.linkCopied'));
    } catch {
      toast.error(t('actions.copyFailed'));
    }
  };

  if (!certificate) {
    return null;
  }

  const state = certificate.stateVerified;
  const unbacked = certificate.provenance === 'unbacked';

  let banner: ReactNode;
  if (state === false) {
    banner = (
      <Alert className='rounded-none border-dashed' variant='destructive'>
        <AlertTriangle />
        <AlertTitle>{t('verify.mismatchTitle')}</AlertTitle>
        <AlertDescription>{t('verify.mismatch')}</AlertDescription>
      </Alert>
    );
  } else if (state === null) {
    banner = (
      <Alert className='rounded-none border-amber-500/60 border-dashed text-amber-700 dark:text-amber-300'>
        <TriangleAlert />
        <AlertTitle>{t('verify.uncheckedTitle')}</AlertTitle>
        <AlertDescription>{t('verify.unchecked')}</AlertDescription>
      </Alert>
    );
  } else if (unbacked) {
    banner = (
      <Alert className='rounded-none border-amber-500/60 border-dashed text-amber-700 dark:text-amber-300'>
        <TriangleAlert />
        <AlertTitle>{t('verify.unbackedTitle')}</AlertTitle>
        <AlertDescription>{t('verify.unbacked')}</AlertDescription>
      </Alert>
    );
  } else {
    banner = (
      <Alert className='rounded-none border-emerald-500/50 border-dashed text-emerald-700 dark:text-emerald-300'>
        <BadgeCheck />
        <AlertTitle>{t('verify.okTitle')}</AlertTitle>
        <AlertDescription>
          {t('verify.ok', {
            block: certificate.blockNumber?.toString() ?? '',
          })}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className='space-y-4'>
      {isMainnetNetwork ? null : (
        <Alert className='rounded-none border-amber-500/60 border-dashed bg-amber-500/10 text-amber-800 dark:text-amber-200'>
          <TriangleAlert />
          <AlertTitle>{t('verify.testnetTitle')}</AlertTitle>
          <AlertDescription>{t('verify.testnet')}</AlertDescription>
        </Alert>
      )}
      {banner}

      {certificates.length > 1 ? (
        <fieldset className='flex flex-wrap items-center gap-2'>
          <legend className='sr-only'>{t('verify.selectToken')}</legend>
          <span className='text-muted-foreground text-sm'>
            {t('verify.batch', { count: certificates.length })}
          </span>
          {certificates.map((c, index) => (
            <Button
              aria-pressed={index === selected}
              key={c.certificateId}
              onClick={() => setSelected(index)}
              size='sm'
              type='button'
              variant={index === selected ? 'default' : 'outline'}
            >
              #{c.tokenId.toString()}
            </Button>
          ))}
        </fieldset>
      ) : null}

      <div className='flex flex-wrap gap-2'>
        <Button onClick={() => window.print()} type='button'>
          <Printer />
          {t('actions.print')}
        </Button>
        <Button
          disabled={!verificationUrl}
          onClick={copyLink}
          type='button'
          variant='outline'
        >
          <Copy />
          {t('actions.copyLink')}
        </Button>
        <Button asChild variant='outline'>
          <a
            href={explorerTxUrl(certificate.txHash)}
            rel='noopener noreferrer'
            target='_blank'
          >
            <ExternalLink />
            {t('actions.explorer')}
          </a>
        </Button>
      </div>

      <div className='overflow-x-auto bg-muted/30 p-2 sm:p-6'>
        <RetirementCertificateView
          certificate={certificate}
          verificationUrl={verificationUrl}
        />
      </div>

      <PrintPortal orientation='landscape'>
        <RetirementCertificateView
          certificate={certificate}
          verificationUrl={verificationUrl}
        />
      </PrintPortal>
    </div>
  );
};

const FAILURE_KEYS = {
  'not-found': 'verify.notFound',
  reverted: 'verify.reverted',
  'not-retirement': 'verify.notRetirement',
} as const;

interface VerifiedCertificateProps {
  txHash: Hash;
  /** Token id (decimal string) to preselect when the tx retired several credits. */
  tokenId?: string;
}

/** Re-reads the retirement tx from the chain and renders its certificate(s) or why it is invalid. */
export const VerifiedCertificate = ({
  txHash,
  tokenId,
}: VerifiedCertificateProps) => {
  const t = useT(messages);
  const state = useVerification(txHash);

  if (state.status === 'loading') {
    return (
      <div aria-busy='true' className='space-y-3'>
        <Skeleton className='h-12 rounded-none' />
        <Skeleton className='h-96 rounded-none' />
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <Alert className='rounded-none border-dashed' variant='destructive'>
        <AlertTriangle />
        <AlertTitle>{t('verify.errorTitle')}</AlertTitle>
        <AlertDescription>{state.message}</AlertDescription>
      </Alert>
    );
  }
  const { result } = state;
  if (result.status !== 'verified') {
    return (
      <EmptyState
        description={t(`${FAILURE_KEYS[result.status]}.description`)}
        icon={<SearchX className='size-12' />}
        title={t(`${FAILURE_KEYS[result.status]}.title`)}
      />
    );
  }
  return (
    <CertificateBody
      certificates={result.certificates}
      initialTokenId={tokenId}
    />
  );
};
