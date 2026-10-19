'use client';

import { Building2, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import type { Hex } from 'viem';
import { useAccount } from 'wagmi';
import { EmptyState } from '@/components/app/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useContractInteraction } from '@/hooks/use-contract-interaction';
import { isBackendConfigured, saveCompanyProfile } from '@/lib/carb-api';
import { useT } from '@/lib/i18n';
import {
  computeContactHash,
  generateContactSalt,
  isRegistryConfigured,
  type OnchainCompany,
  type RegistrationType,
  saveContactRecord,
} from '@/lib/registry';
import { messages } from '../_messages';
import {
  CompanyForm,
  type CompanyFormValues,
  toNumber,
  useCompanyForm,
} from './_components/company-form';

const REDIRECT_DELAY_MS = 2000;
const CHANGE_EPSILON = 1e-6;

interface RegistrationState {
  type: RegistrationType;
  company: OnchainCompany | null;
}

const toFormValues = (company: OnchainCompany): CompanyFormValues => ({
  companyName: company.name,
  legalEntityId: company.legalId,
  scope1Emissions: String(company.scope1),
  scope2Emissions: String(company.scope2),
  scope3Emissions: String(company.scope3),
  email: '',
  phone: '',
});

const profileChanged = (company: OnchainCompany, values: CompanyFormValues) =>
  company.name !== values.companyName ||
  company.legalId !== values.legalEntityId;

const emissionsChanged = (company: OnchainCompany, values: CompanyFormValues) =>
  Math.abs(company.scope1 - toNumber(values.scope1Emissions)) >
    CHANGE_EPSILON ||
  Math.abs(company.scope2 - toNumber(values.scope2Emissions)) >
    CHANGE_EPSILON ||
  Math.abs(company.scope3 - toNumber(values.scope3Emissions)) > CHANGE_EPSILON;

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

/** The legacy backend is optional; failures here are intentionally silent. */
const syncProfileToBackend = async (
  walletAddress: string,
  values: CompanyFormValues
) => {
  if (!isBackendConfigured()) {
    return;
  }
  try {
    await saveCompanyProfile({
      walletAddress,
      name: values.companyName,
      legalEntityId: values.legalEntityId,
      email: values.email,
      phone: values.phone,
      scope1Emissions: toNumber(values.scope1Emissions),
      scope2Emissions: toNumber(values.scope2Emissions),
      scope3Emissions: toNumber(values.scope3Emissions),
      registrationDate: Date.now(),
    });
  } catch {
    // Backend is optional: the onchain registry is the source of truth.
  }
};

const useRegistrationState = (
  address: string | undefined,
  form: UseFormReturn<CompanyFormValues>
) => {
  const { getRegistrationType, getCompanyData } = useContractInteraction();
  const [state, setState] = useState<RegistrationState | null>(null);

  const refresh = useCallback(async () => {
    if (!address) {
      return;
    }
    const [type, company] = await Promise.all([
      getRegistrationType(address),
      getCompanyData(address),
    ]);
    setState({ type, company });
    if (company) {
      form.reset(toFormValues(company));
    }
  }, [address, form, getRegistrationType, getCompanyData]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { state, refresh };
};

const CompanyRegisterPage = () => {
  const t = useT(messages);
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { registerCompany, updateCompanyProfile, updateEmissions } =
    useContractInteraction();

  const form = useCompanyForm();
  const { state, refresh } = useRegistrationState(address, form);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const registerNew = async (
    values: CompanyFormValues,
    walletAddress: string
  ): Promise<boolean> => {
    const salt = generateContactSalt();
    const contactHash = computeContactHash(values.email, values.phone, salt);
    const toastId = toast.loading(t('register.toast.registering'));
    try {
      const hash = await registerCompany({
        companyName: values.companyName,
        legalEntityId: values.legalEntityId,
        scope1Emissions: toNumber(values.scope1Emissions),
        scope2Emissions: toNumber(values.scope2Emissions),
        scope3Emissions: toNumber(values.scope3Emissions),
        contactHash,
      });
      if (!hash) {
        return false;
      }
    } finally {
      toast.dismiss(toastId);
    }
    saveContactRecord(walletAddress, {
      email: values.email,
      phone: values.phone,
      salt,
    });
    toast.success(t('register.toast.registered'));
    await syncProfileToBackend(walletAddress, values);
    await refresh();
    return true;
  };

  const rememberContact = (
    hasContact: boolean,
    values: CompanyFormValues,
    salt: Hex
  ) => {
    if (hasContact && address) {
      saveContactRecord(address, {
        email: values.email,
        phone: values.phone,
        salt,
      });
    }
  };

  const updateExisting = async (
    company: OnchainCompany,
    values: CompanyFormValues
  ) => {
    const hasContact = values.email !== '' || values.phone !== '';
    if (hasContact && !(values.email && values.phone)) {
      toast.error(t('register.toast.contactIncomplete'));
      return;
    }
    const changedProfile = profileChanged(company, values) || hasContact;
    const changedEmissions = emissionsChanged(company, values);
    if (!(changedProfile || changedEmissions)) {
      toast.info(t('register.toast.noChanges'));
      return;
    }
    const salt = generateContactSalt();
    const contactHash = hasContact
      ? computeContactHash(values.email, values.phone, salt)
      : company.contactHash;
    const toastId = toast.loading(t('register.toast.saving'));
    try {
      if (changedProfile) {
        await updateCompanyProfile({
          companyName: values.companyName,
          legalEntityId: values.legalEntityId,
          contactHash,
        });
        rememberContact(hasContact, values, salt);
      }
      if (changedEmissions) {
        await updateEmissions(
          toNumber(values.scope1Emissions),
          toNumber(values.scope2Emissions),
          toNumber(values.scope3Emissions)
        );
      }
    } finally {
      toast.dismiss(toastId);
    }
    toast.success(t('register.toast.updated'));
    if (address && hasContact) {
      await syncProfileToBackend(address, values);
    }
    await refresh();
  };

  const onSubmit = async (values: CompanyFormValues) => {
    if (!address) {
      toast.error(t('register.toast.noAddress'));
      return;
    }
    setIsSubmitting(true);
    try {
      if (state?.company) {
        await updateExisting(state.company, values);
        return;
      }
      if (!values.email) {
        form.setError('email', { message: t('form.error.email') });
      }
      if (!values.phone) {
        form.setError('phone', { message: t('form.error.phone') });
      }
      if (!(values.email && values.phone)) {
        return;
      }
      if (await registerNew(values, address)) {
        setTimeout(() => {
          router.push('/app/company/dashboard');
        }, REDIRECT_DELAY_MS);
      }
    } catch (error) {
      toast.error(errorMessage(error, t('register.toast.registerFailed')));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isConnected) {
    return (
      <EmptyState
        description={t('register.connect.desc')}
        icon={<Wallet className='size-8' />}
        title={t('common.walletRequiredTitle')}
      />
    );
  }

  if (!isRegistryConfigured()) {
    return (
      <EmptyState
        description={t('common.registryNotConfiguredDesc')}
        icon={<Building2 className='size-8' />}
        title={t('common.registryNotConfiguredTitle')}
      />
    );
  }

  if (!state) {
    return (
      <div className='mx-auto w-full max-w-2xl space-y-4'>
        <Skeleton className='h-8 w-64' />
        <Skeleton className='h-96 rounded-none' />
      </div>
    );
  }

  if (state.type === 'trader') {
    return (
      <EmptyState
        action={
          <Button asChild>
            <Link href='/app/trader/dashboard'>
              {t('common.goToTraderDashboard')}
            </Link>
          </Button>
        }
        description={t('register.trader.desc')}
        icon={<Building2 className='size-8' />}
        title={t('register.trader.title')}
      />
    );
  }

  const isRegistered = state.company !== null;
  let submitLabel = t('register.submit.new');
  if (isRegistered) {
    submitLabel = t('register.submit.save');
  }
  if (isSubmitting) {
    submitLabel = isRegistered
      ? t('register.submit.saving')
      : t('register.submit.registering');
  }

  return (
    <div className='mx-auto w-full max-w-2xl space-y-6'>
      <div>
        <h1 className='font-semibold text-2xl tracking-tight'>
          {isRegistered ? t('register.title.profile') : t('register.title.new')}
        </h1>
        <p className='text-muted-foreground'>
          {isRegistered
            ? t('register.subtitle.profile')
            : t('register.subtitle.new')}
        </p>
      </div>

      <Card className='rounded-none border-dashed shadow-none'>
        <CardContent className='space-y-6'>
          <CompanyForm
            contactHint={
              isRegistered
                ? t('form.contact.updateHint')
                : t('form.contact.hint')
            }
            disabled={isSubmitting}
            footer={
              <div className='space-y-2 text-muted-foreground text-xs'>
                <p>
                  {isRegistered
                    ? t('register.privacy.update')
                    : t('register.privacy.new')}
                </p>
                {isRegistered ? <p>{t('register.footer.profile')}</p> : null}
              </div>
            }
            form={form}
            isBusy={isSubmitting}
            onSubmit={onSubmit}
            submitLabel={submitLabel}
            walletAddress={address}
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default CompanyRegisterPage;
