'use client';

import { BadgeCheck, Clock, ShieldCheck, ShieldOff } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { Hex } from 'viem';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useContractInteraction } from '@/hooks/use-contract-interaction';
import { formatAddress } from '@/lib/carb-format';
import { formatChainDate } from '@/lib/chain-format';
import { type TranslateFn, useLocaleStore, useT } from '@/lib/i18n';
import { registryErrorMessage } from '@/lib/registry';
import { cn } from '@/lib/utils';
import type { RegistryProfile } from '../_lib/use-registry-profile';
import { messages } from '../_messages';

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

/** Onchain KYB badge for the connected wallet. */
const OnchainBadge = ({ profile }: { profile: RegistryProfile }) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);

  if (profile.registration !== 'company' || !profile.company) {
    return (
      <p className='text-muted-foreground text-sm'>
        {profile.registration === 'trader'
          ? t('verification.traderNote')
          : t('verification.notRegistered')}
      </p>
    );
  }
  const { verified, registeredAt } = profile.company;
  return (
    <div className='flex flex-wrap items-center gap-3'>
      <Badge
        className={cn(
          'rounded-none px-3 py-1 text-sm',
          verified
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
        )}
        variant='outline'
      >
        {verified ? <BadgeCheck /> : <Clock />}
        {verified ? t('verification.verified') : t('verification.pending')}
      </Badge>
      <span className='text-muted-foreground text-xs'>
        {t('verification.registeredOn', {
          date: formatChainDate(registeredAt, locale, false),
        })}
      </span>
      {verified ? null : (
        <span className='basis-full text-muted-foreground text-xs'>
          {t('verification.pendingHint')}
        </span>
      )}
    </div>
  );
};

/** Profile a verifier reviewed; an approval is bound to `profileHash`. */
interface ReviewedProfile {
  name: string;
  legalId: string;
  contactHash: Hex;
  verified: boolean;
  profileHash: Hex;
}

const PROFILE_CHANGED_PATTERN = /Profile changed/i;
const LEGAL_ID_VERIFIED_PATTERN = /Legal ID already verified/i;

const verifierErrorMessage = (error: unknown, t: TranslateFn): string => {
  const message = registryErrorMessage(error);
  if (PROFILE_CHANGED_PATTERN.test(message)) {
    return t('verifier.error.profileChanged');
  }
  if (LEGAL_ID_VERIFIED_PATTERN.test(message)) {
    return t('verifier.error.legalIdVerified');
  }
  return message;
};

/** Verifier-only tool: review a company's profile, then approve exactly that profile or revoke. */
const VerifierTool = ({
  account,
  onChanged,
}: {
  account: string;
  onChanged: () => void;
}) => {
  const t = useT(messages);
  const { getCompanyData, getProfileHash, setCompanyVerified } =
    useContractInteraction();
  const [target, setTarget] = useState(account);
  const [review, setReview] = useState<ReviewedProfile | null | undefined>(
    undefined
  );
  const [busy, setBusy] = useState(false);
  const valid = ADDRESS_PATTERN.test(target.trim());

  const load = async (): Promise<ReviewedProfile | null> => {
    const address = target.trim();
    const [company, profileHash] = await Promise.all([
      getCompanyData(address),
      getProfileHash(address),
    ]);
    if (!(company && profileHash)) {
      return null;
    }
    return {
      name: company.name,
      legalId: company.legalId,
      contactHash: company.contactHash,
      verified: company.verified,
      profileHash,
    };
  };

  const lookup = async () => {
    setBusy(true);
    try {
      setReview(await load());
    } finally {
      setBusy(false);
    }
  };

  const toggle = async () => {
    if (!review) {
      return;
    }
    setBusy(true);
    try {
      if (review.verified) {
        await setCompanyVerified(target.trim(), false);
        toast.success(t('verifier.revoked'));
      } else {
        await setCompanyVerified(target.trim(), true, review.profileHash);
        toast.success(t('verifier.granted'));
      }
      setReview(await load());
      onChanged();
    } catch (error) {
      toast.error(verifierErrorMessage(error, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className='space-y-3 border border-dashed p-4'>
      <div className='flex items-center gap-2'>
        <ShieldCheck className='size-4 text-primary' />
        <h3 className='font-semibold text-sm'>{t('verifier.title')}</h3>
      </div>
      <p className='text-muted-foreground text-xs'>
        {t('verifier.description')}
      </p>
      <div className='space-y-1.5'>
        <Label htmlFor='verifier-target'>{t('verifier.target')}</Label>
        <div className='flex flex-col gap-2 sm:flex-row'>
          <Input
            aria-invalid={target.length > 0 && !valid}
            className='font-mono'
            id='verifier-target'
            onChange={(event) => {
              setTarget(event.target.value);
              setReview(undefined);
            }}
            placeholder='0x…'
            value={target}
          />
          <Button
            disabled={!valid || busy}
            onClick={lookup}
            type='button'
            variant='outline'
          >
            {t('verifier.lookup')}
          </Button>
        </div>
      </div>
      {review === null ? (
        <output className='block text-muted-foreground text-sm'>
          {t('verifier.notCompany')}
        </output>
      ) : null}
      {review ? (
        <div className='space-y-3'>
          <dl className='grid gap-3 border border-dashed p-3 text-sm sm:grid-cols-2'>
            <div className='min-w-0'>
              <dt className='text-muted-foreground text-xs'>
                {t('verifier.review.name')}
              </dt>
              <dd className='break-words font-medium'>{review.name}</dd>
            </div>
            <div className='min-w-0'>
              <dt className='text-muted-foreground text-xs'>
                {t('verifier.review.legalId')}
              </dt>
              <dd className='break-words font-medium'>{review.legalId}</dd>
            </div>
            <div className='min-w-0'>
              <dt className='text-muted-foreground text-xs'>
                {t('verifier.review.contactHash')}
              </dt>
              <dd className='font-medium font-mono text-xs'>
                {formatAddress(review.contactHash, 8)}
              </dd>
            </div>
            <div className='min-w-0'>
              <dt className='text-muted-foreground text-xs'>
                {t('verifier.review.profileHash')}
              </dt>
              <dd className='font-medium font-mono text-xs'>
                {formatAddress(review.profileHash, 8)}
              </dd>
            </div>
          </dl>
          <p className='text-muted-foreground text-xs'>
            {t('verifier.review.hint')}
          </p>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <Badge className='rounded-none' variant='outline'>
              {review.verified
                ? t('verification.verified')
                : t('verification.pending')}
            </Badge>
            <Button
              disabled={busy}
              onClick={toggle}
              type='button'
              variant={review.verified ? 'destructive' : 'default'}
            >
              {review.verified ? <ShieldOff /> : <BadgeCheck />}
              {review.verified ? t('verifier.revoke') : t('verifier.grant')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

interface KybVerificationProps {
  account: string;
  profile: RegistryProfile | null;
  onChanged: () => void;
}

export const KybVerification = ({
  account,
  profile,
  onChanged,
}: KybVerificationProps) => {
  const t = useT(messages);
  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle>{t('verification.title')}</CardTitle>
        <CardDescription>{t('verification.description')}</CardDescription>
      </CardHeader>
      <CardContent className='space-y-4'>
        {profile ? (
          <OnchainBadge profile={profile} />
        ) : (
          <p className='text-muted-foreground text-sm'>
            {t('verification.unavailable')}
          </p>
        )}
        {profile?.isVerifier ? (
          <VerifierTool account={account} onChanged={onChanged} />
        ) : null}
      </CardContent>
    </Card>
  );
};
