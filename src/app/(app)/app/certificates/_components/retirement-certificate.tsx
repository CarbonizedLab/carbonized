'use client';

import { BadgeCheck, Leaf, TriangleAlert } from 'lucide-react';
import { formatChainDate, formatDecimal } from '@/lib/chain-format';
import { explorerTxUrl } from '@/lib/explorer';
import { useLocaleStore, useT } from '@/lib/i18n';
import { isMainnetNetwork } from '@/lib/network';
import type { RetirementCertificateData } from '@/lib/retirement';
import { messages } from '../_messages';

interface FieldProps {
  label: string;
  value: string;
  mono?: boolean;
}

const Field = ({ label, value, mono }: FieldProps) => (
  <div className='min-w-0'>
    <dt className='text-[10px] text-emerald-900/70 uppercase tracking-widest'>
      {label}
    </dt>
    <dd className={`break-words text-sm ${mono ? 'font-mono text-xs' : ''}`}>
      {value || '—'}
    </dd>
  </div>
);

interface RetirementCertificateViewProps {
  certificate: RetirementCertificateData;
  /** Absolute public verification URL (empty until the origin is known). */
  verificationUrl: string;
}

/**
 * Paper-style retirement certificate. Uses fixed light colors on purpose so the
 * on-screen preview and the printed/PDF output look identical in any theme.
 */
export const RetirementCertificateView = ({
  certificate,
  verificationUrl,
}: RetirementCertificateViewProps) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);
  const { credit } = certificate;
  const verified =
    certificate.stateVerified === true &&
    certificate.provenance === 'issuer-backed';
  let statusKey = 'cert.verified';
  if (certificate.stateVerified === null) {
    statusKey = 'cert.unchecked';
  } else if (certificate.stateVerified === false) {
    statusKey = 'cert.unverified';
  } else if (certificate.provenance === 'unbacked') {
    statusKey = 'cert.unbacked';
  }

  return (
    <article
      aria-label={t('cert.aria', { id: certificate.certificateId })}
      className='mx-auto w-full max-w-4xl border-[6px] border-emerald-800 border-double bg-white p-6 text-neutral-900 sm:p-10'
    >
      <header className='flex flex-col items-center gap-2 text-center'>
        <span className='flex size-14 items-center justify-center rounded-full border-2 border-emerald-800 text-emerald-800'>
          <Leaf className='size-7' />
        </span>
        <p className='font-semibold text-emerald-800 text-xs uppercase tracking-[0.35em]'>
          Carbonized
        </p>
        <h2 className='font-serif text-2xl text-emerald-950 tracking-tight sm:text-4xl'>
          {t('cert.title')}
        </h2>
        <p className='font-mono text-emerald-900/80 text-xs'>
          {t('cert.number', { id: certificate.certificateId })}
        </p>
      </header>

      <section className='my-8 space-y-3 text-center'>
        <p className='text-neutral-600 text-sm'>{t('cert.certifies')}</p>
        <p className='break-all font-mono font-semibold text-base text-emerald-950 sm:text-xl'>
          {certificate.beneficiary}
        </p>
        <p className='text-neutral-600 text-sm'>{t('cert.retired')}</p>
        <p className='font-serif text-4xl text-emerald-800 sm:text-5xl'>
          {formatDecimal(certificate.tonnes, locale)}{' '}
          <span className='text-xl sm:text-2xl'>{t('cert.unit')}</span>
        </p>
        <p className='mx-auto max-w-xl text-neutral-700 text-sm italic'>
          {t('cert.purpose')}: “{certificate.reason}”
        </p>
      </section>

      <dl className='grid gap-4 border-emerald-800/30 border-y py-5 sm:grid-cols-3'>
        <Field
          label={t('cert.date')}
          value={formatChainDate(certificate.timestamp, locale)}
        />
        <Field label={t('cert.token')} value={`#${certificate.tokenId}`} />
        <Field
          label={t('cert.block')}
          mono
          value={certificate.blockNumber?.toString() ?? ''}
        />
        <Field label={t('cert.project')} value={credit?.projectName ?? ''} />
        <Field
          label={t('cert.methodology')}
          value={credit?.methodology ?? ''}
        />
        <Field
          label={t('cert.vintage')}
          value={credit ? String(credit.vintageYear) : ''}
        />
        <Field label={t('cert.geography')} value={credit?.geography ?? ''} />
        <Field
          label={t('cert.serial')}
          mono
          value={credit?.serialNumber ?? ''}
        />
        <Field
          label={t('cert.projectId')}
          mono
          value={credit?.projectId ?? ''}
        />
      </dl>

      <footer className='mt-5 space-y-2 text-xs'>
        <p className='break-all'>
          <span className='text-emerald-900/70 uppercase tracking-widest'>
            {t('cert.tx')}:{' '}
          </span>
          <a
            className='font-mono underline underline-offset-2'
            href={explorerTxUrl(certificate.txHash)}
            rel='noopener noreferrer'
            target='_blank'
          >
            {certificate.txHash}
          </a>
        </p>
        {verificationUrl ? (
          <p className='break-all'>
            <span className='text-emerald-900/70 uppercase tracking-widest'>
              {t('cert.verifyAt')}:{' '}
            </span>
            <span className='font-mono'>{verificationUrl}</span>
          </p>
        ) : null}
        <p
          className={`flex items-center gap-1.5 font-semibold ${
            verified ? 'text-emerald-800' : 'text-amber-700'
          }`}
        >
          {verified ? (
            <BadgeCheck className='size-4' />
          ) : (
            <TriangleAlert className='size-4' />
          )}
          {t(statusKey)}
        </p>
        {isMainnetNetwork ? null : (
          <p className='flex items-center gap-1.5 font-semibold text-amber-700'>
            <TriangleAlert className='size-4' />
            {t('cert.testnet')}
          </p>
        )}
        <p className='text-neutral-500'>{t('cert.disclaimer')}</p>
      </footer>
    </article>
  );
};
