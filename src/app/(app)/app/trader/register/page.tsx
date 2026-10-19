'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { type Control, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useAccount } from 'wagmi';
import { z } from 'zod';
import { EmptyState } from '@/components/app/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useContractInteraction } from '@/hooks/use-contract-interaction';
import { formatAddress } from '@/lib/carb-format';
import { type TranslateFn, useT } from '@/lib/i18n';
import {
  computeContactHash,
  generateContactSalt,
  isRegistryConfigured,
  type RegistrationType,
  saveContactRecord,
} from '@/lib/registry';
import { messages } from '../_messages';

const REDIRECT_DELAY_MS = 1500;
const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 120;
const MAX_PHONE_LENGTH = 32;
const MAX_COUNTRY_LENGTH = 64;

const TRADER_BENEFIT_KEYS = [
  'register.benefit.buy',
  'register.benefit.list',
  'register.benefit.track',
] as const;

const createTraderSchema = (t: TranslateFn) => {
  const maxChars = (max: number) => t('register.error.maxChars', { max });
  const emailRequired = t('register.error.email');
  return z.object({
    traderName: z
      .string()
      .trim()
      .min(1, t('register.error.name'))
      .max(MAX_NAME_LENGTH, maxChars(MAX_NAME_LENGTH)),
    email: z
      .string()
      .trim()
      .min(1, emailRequired)
      .includes('@', { message: emailRequired })
      .max(MAX_EMAIL_LENGTH, maxChars(MAX_EMAIL_LENGTH)),
    phone: z
      .string()
      .trim()
      .min(1, t('register.error.phone'))
      .max(MAX_PHONE_LENGTH, maxChars(MAX_PHONE_LENGTH)),
    country: z
      .string()
      .trim()
      .min(1, t('register.error.country'))
      .max(MAX_COUNTRY_LENGTH, maxChars(MAX_COUNTRY_LENGTH)),
  });
};

interface TraderFormValues {
  traderName: string;
  email: string;
  phone: string;
  country: string;
}

interface TextFieldProps {
  control: Control<TraderFormValues>;
  name: keyof TraderFormValues;
  label: string;
  placeholder: string;
  type: 'text' | 'email' | 'tel';
  disabled: boolean;
}

const TextField = ({
  control,
  name,
  label,
  placeholder,
  type,
  disabled,
}: TextFieldProps) => (
  <FormField
    control={control}
    name={name}
    render={({ field }) => (
      <FormItem>
        <FormLabel>{label}</FormLabel>
        <FormControl>
          <Input
            disabled={disabled}
            placeholder={placeholder}
            type={type}
            {...field}
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    )}
  />
);

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

const TraderRegisterPage = () => {
  const t = useT(messages);
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { registerTrader, getRegistrationType, isLoading } =
    useContractInteraction();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registration, setRegistration] = useState<RegistrationType | null>(
    null
  );

  const form = useForm<TraderFormValues>({
    resolver: zodResolver(createTraderSchema(t)),
    defaultValues: { traderName: '', email: '', phone: '', country: '' },
  });

  useEffect(() => {
    if (!(isConnected && address)) {
      return;
    }
    getRegistrationType(address).then(setRegistration);
  }, [isConnected, address, getRegistrationType]);

  const onSubmit = async (values: TraderFormValues) => {
    if (!address) {
      toast.error(t('register.toast.noAddress'));
      return;
    }

    setIsSubmitting(true);
    const loadingToast = toast.loading(t('register.toast.registering'));
    const salt = generateContactSalt();
    const contactHash = computeContactHash(values.email, values.phone, salt);

    try {
      const txHash = await registerTrader({
        traderName: values.traderName,
        contactHash,
        country: values.country,
      });
      if (!txHash) {
        throw new Error(t('register.toast.cancelled'));
      }
      saveContactRecord(address, {
        email: values.email,
        phone: values.phone,
        salt,
      });
      toast.dismiss(loadingToast);
      toast.success(t('register.toast.created', { hash: txHash.slice(0, 10) }));
      setRegistration('trader');

      setTimeout(() => {
        router.push('/app/trader/dashboard');
      }, REDIRECT_DELAY_MS);
    } catch (error: unknown) {
      toast.dismiss(loadingToast);
      toast.error(errorMessage(error, t('register.error.failed')));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isConnected) {
    return (
      <EmptyState
        description={t('register.connect.desc')}
        icon={<TrendingUp className='size-8' />}
        title={t('register.connect.title')}
      />
    );
  }

  if (!isRegistryConfigured()) {
    return (
      <EmptyState
        description={t('common.registryNotConfiguredDesc')}
        icon={<TrendingUp className='size-8' />}
        title={t('common.registryNotConfiguredTitle')}
      />
    );
  }

  if (registration === null) {
    return (
      <div className='mx-auto w-full max-w-2xl space-y-4'>
        <Skeleton className='h-8 w-64' />
        <Skeleton className='h-96 rounded-none' />
      </div>
    );
  }

  if (registration !== 'none' && !isSubmitting) {
    const isTrader = registration === 'trader';
    return (
      <EmptyState
        action={
          <Button asChild>
            <Link
              href={
                isTrader ? '/app/trader/dashboard' : '/app/company/dashboard'
              }
            >
              {isTrader
                ? t('register.existing.openTrader')
                : t('register.existing.openCompany')}
            </Link>
          </Button>
        }
        description={
          isTrader
            ? t('register.existing.traderDesc')
            : t('register.existing.companyDesc')
        }
        icon={<Building2 className='size-8' />}
        title={
          isTrader
            ? t('register.existing.traderTitle')
            : t('register.existing.companyTitle')
        }
      />
    );
  }

  return (
    <div className='mx-auto w-full max-w-2xl space-y-6'>
      <div>
        <h1 className='font-semibold text-2xl tracking-tight'>
          {t('register.title')}
        </h1>
        <p className='text-muted-foreground'>{t('register.subtitle')}</p>
      </div>

      <Card className='rounded-none border-dashed shadow-none'>
        <CardContent className='space-y-6'>
          <Form {...form}>
            <form className='space-y-6' onSubmit={form.handleSubmit(onSubmit)}>
              <section className='space-y-4'>
                <h2 className='font-semibold text-lg'>
                  {t('register.section.personal')}
                </h2>
                <TextField
                  control={form.control}
                  disabled={isSubmitting}
                  label={t('register.name.label')}
                  name='traderName'
                  placeholder={t('register.name.placeholder')}
                  type='text'
                />
                <TextField
                  control={form.control}
                  disabled={isSubmitting}
                  label={t('register.email.label')}
                  name='email'
                  placeholder={t('register.email.placeholder')}
                  type='email'
                />
                <TextField
                  control={form.control}
                  disabled={isSubmitting}
                  label={t('register.phone.label')}
                  name='phone'
                  placeholder={t('register.phone.placeholder')}
                  type='tel'
                />
                <TextField
                  control={form.control}
                  disabled={isSubmitting}
                  label={t('register.country.label')}
                  name='country'
                  placeholder={t('register.country.placeholder')}
                  type='text'
                />
              </section>

              <div className='border border-dashed p-4'>
                <h3 className='mb-2 font-semibold'>
                  {t('register.benefits.title')}
                </h3>
                <ul className='list-inside list-disc space-y-1 text-muted-foreground text-sm'>
                  {TRADER_BENEFIT_KEYS.map((key) => (
                    <li key={key}>{t(key)}</li>
                  ))}
                </ul>
              </div>

              <div className='border border-dashed p-4 text-muted-foreground text-sm'>
                {t('register.connectedWallet')}{' '}
                <span className='font-mono text-foreground'>
                  {address ? formatAddress(address, 8) : ''}
                </span>
              </div>

              <p className='border border-dashed p-4 text-muted-foreground text-xs'>
                {t('register.privacy')}
              </p>

              <Button
                className='w-full'
                disabled={isSubmitting || isLoading}
                type='submit'
              >
                {isSubmitting ? t('register.submitting') : t('register.submit')}
              </Button>

              <p className='text-center text-muted-foreground text-xs'>
                {t('register.footer')}
              </p>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
};

export default TraderRegisterPage;
