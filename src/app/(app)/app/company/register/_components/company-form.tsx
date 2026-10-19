'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { ReactNode } from 'react';
import { type UseFormReturn, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { formatAddress } from '@/lib/carb-format';
import { type TranslateFn, useT } from '@/lib/i18n';
import { messages } from '../../_messages';

const MAX_NAME_LENGTH = 100;
const MAX_LEGAL_ID_LENGTH = 64;
const MAX_EMAIL_LENGTH = 120;
const MAX_PHONE_LENGTH = 32;
const MAX_EMISSION_TONNES = 1e12;

const createCompanySchema = (t: TranslateFn) => {
  const maxChars = (max: number) => t('form.error.maxChars', { max });
  const emailRequired = t('form.error.email');
  const emissionField = z.string().refine(
    (value) => {
      if (value.trim() === '') {
        return true;
      }
      const parsed = Number.parseFloat(value);
      return (
        Number.isFinite(parsed) && parsed >= 0 && parsed <= MAX_EMISSION_TONNES
      );
    },
    { message: t('form.error.emission') }
  );

  return z.object({
    companyName: z
      .string()
      .trim()
      .min(1, t('form.error.companyName'))
      .max(MAX_NAME_LENGTH, maxChars(MAX_NAME_LENGTH)),
    legalEntityId: z
      .string()
      .trim()
      .min(1, t('form.error.legalId'))
      .max(MAX_LEGAL_ID_LENGTH, maxChars(MAX_LEGAL_ID_LENGTH)),
    scope1Emissions: emissionField,
    scope2Emissions: emissionField,
    scope3Emissions: emissionField,
    // Contact is required when registering (enforced on submit); an empty pair
    // keeps the existing onchain commitment when updating a profile.
    email: z
      .string()
      .trim()
      .max(MAX_EMAIL_LENGTH, maxChars(MAX_EMAIL_LENGTH))
      .refine((value) => value === '' || value.includes('@'), {
        message: emailRequired,
      }),
    phone: z.string().trim().max(MAX_PHONE_LENGTH, maxChars(MAX_PHONE_LENGTH)),
  });
};

export interface CompanyFormValues {
  companyName: string;
  legalEntityId: string;
  scope1Emissions: string;
  scope2Emissions: string;
  scope3Emissions: string;
  email: string;
  phone: string;
}

export const emptyCompanyValues: CompanyFormValues = {
  companyName: '',
  legalEntityId: '',
  scope1Emissions: '',
  scope2Emissions: '',
  scope3Emissions: '',
  email: '',
  phone: '',
};

export const toNumber = (value: string): number =>
  Number.parseFloat(value) || 0;

export const useCompanyForm = () => {
  const t = useT(messages);
  const resolver = zodResolver(createCompanySchema(t));
  return useForm<CompanyFormValues>({
    resolver,
    defaultValues: emptyCompanyValues,
  });
};

const SCOPE_FIELDS = [
  {
    name: 'scope1Emissions',
    labelKey: 'form.scope1.label',
    placeholderKey: 'form.scope1.placeholder',
  },
  {
    name: 'scope2Emissions',
    labelKey: 'form.scope2.label',
    placeholderKey: 'form.scope2.placeholder',
  },
  {
    name: 'scope3Emissions',
    labelKey: 'form.scope3.label',
    placeholderKey: 'form.scope3.placeholder',
  },
] as const;

interface CompanyFormProps {
  form: UseFormReturn<CompanyFormValues>;
  disabled: boolean;
  walletAddress?: string;
  submitLabel: string;
  isBusy: boolean;
  onSubmit: (values: CompanyFormValues) => void | Promise<void>;
  footer?: ReactNode;
  contactHint: string;
}

const EmissionsTotal = ({
  form,
}: {
  form: UseFormReturn<CompanyFormValues>;
}) => {
  const t = useT(messages);
  const [scope1, scope2, scope3] = useWatch({
    control: form.control,
    name: ['scope1Emissions', 'scope2Emissions', 'scope3Emissions'],
  });
  if (!(scope1 || scope2 || scope3)) {
    return null;
  }
  const total =
    toNumber(scope1 ?? '') + toNumber(scope2 ?? '') + toNumber(scope3 ?? '');
  return (
    <div className='border border-dashed p-4 text-sm'>
      {t('form.totalEmissions')}{' '}
      <span className='font-bold'>
        {total.toFixed(2)} {t('form.tonnesCo2')}
      </span>
    </div>
  );
};

export const CompanyForm = ({
  form,
  disabled,
  walletAddress,
  submitLabel,
  isBusy,
  onSubmit,
  footer,
  contactHint,
}: CompanyFormProps) => {
  const t = useT(messages);
  return (
    <Form {...form}>
      <form className='space-y-6' onSubmit={form.handleSubmit(onSubmit)}>
        <section className='space-y-4'>
          <h2 className='font-semibold text-lg'>{t('form.section.company')}</h2>
          <FormField
            control={form.control}
            name='companyName'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('form.companyName.label')}</FormLabel>
                <FormControl>
                  <Input
                    disabled={disabled}
                    placeholder={t('form.companyName.placeholder')}
                    type='text'
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='legalEntityId'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('form.legalId.label')}</FormLabel>
                <FormControl>
                  <Input
                    disabled={disabled}
                    placeholder={t('form.legalId.placeholder')}
                    type='text'
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        <section className='space-y-4'>
          <div>
            <h2 className='font-semibold text-lg'>
              {t('form.section.emissions')}
            </h2>
            <p className='text-muted-foreground text-sm'>
              {t('form.emissions.help')}
            </p>
          </div>
          {SCOPE_FIELDS.map(({ name, labelKey, placeholderKey }) => (
            <FormField
              control={form.control}
              key={name}
              name={name}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t(labelKey)}</FormLabel>
                  <FormControl>
                    <Input
                      disabled={disabled}
                      min={0}
                      placeholder={t(placeholderKey)}
                      step='any'
                      type='number'
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          ))}
          <EmissionsTotal form={form} />
        </section>

        <section className='space-y-4'>
          <h2 className='font-semibold text-lg'>{t('form.section.contact')}</h2>
          <FormField
            control={form.control}
            name='email'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('form.email.label')}</FormLabel>
                <FormControl>
                  <Input
                    disabled={disabled}
                    placeholder={t('form.email.placeholder')}
                    type='email'
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name='phone'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('form.phone.label')}</FormLabel>
                <FormControl>
                  <Input
                    disabled={disabled}
                    placeholder={t('form.phone.placeholder')}
                    type='tel'
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <p className='text-muted-foreground text-xs'>{contactHint}</p>
        </section>

        <div className='border border-dashed p-4 text-muted-foreground text-sm'>
          {t('form.registeringWallet')}{' '}
          <span className='font-mono text-foreground'>
            {walletAddress ? formatAddress(walletAddress, 8) : ''}
          </span>
        </div>

        {footer}

        <Button className='w-full' disabled={isBusy || disabled} type='submit'>
          {submitLabel}
        </Button>
      </form>
    </Form>
  );
};
