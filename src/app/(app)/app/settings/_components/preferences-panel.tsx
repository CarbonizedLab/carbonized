'use client';

import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CONTRACTS } from '@/config/contracts';
import { explorerAddressUrl } from '@/lib/explorer';
import { LOCALES, type Locale, useLocaleStore, useT } from '@/lib/i18n';
import { messages } from '../_messages';

const LANGUAGE_LABEL: Record<Locale, string> = {
  en: 'English',
  zh: '中文（简体）',
};

/** Language preference (persisted by the shared locale store). */
export const PreferencesPanel = () => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);

  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle>{t('prefs.title')}</CardTitle>
        <CardDescription>{t('prefs.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <fieldset className='flex flex-wrap gap-2'>
          <legend className='sr-only'>{t('prefs.language')}</legend>
          {LOCALES.map((code) => (
            <Button
              aria-pressed={code === locale}
              key={code}
              onClick={() => setLocale(code)}
              type='button'
              variant={code === locale ? 'default' : 'outline'}
            >
              {LANGUAGE_LABEL[code]}
            </Button>
          ))}
        </fieldset>
      </CardContent>
    </Card>
  );
};

const CONTRACT_ROWS: readonly [string, string][] = [
  ['CarbonCreditNFT', CONTRACTS.carbonCreditNFT],
  ['CarbonCreditToken (CCT)', CONTRACTS.carbonCreditToken],
  ['CarbonMarketplace', CONTRACTS.carbonMarketplace],
  ['CarbonRegistry', CONTRACTS.carbonRegistry],
  ['CarbonPriceOracle', CONTRACTS.carbonPriceOracle],
  ['EmissionVerifier', CONTRACTS.emissionVerifier],
  ['USDG', CONTRACTS.usdc],
  ['CarbToken (CARB)', CONTRACTS.carbToken],
  ['CarbVotes (vCARB)', CONTRACTS.carbVotes],
  ['CarbStaking', CONTRACTS.carbStaking],
  ['IssuerBond', CONTRACTS.issuerBond],
  ['CarbGovernor', CONTRACTS.governor],
  ['CarbTimelock', CONTRACTS.timelock],
];

/** CARB contracts are optional: they are listed only once configured. */
const OPTIONAL_ROWS: Record<string, true> = {
  'CarbToken (CARB)': true,
  CarbStaking: true,
  IssuerBond: true,
  CarbGovernor: true,
  CarbTimelock: true,
  'CarbVotes (vCARB)': true,
};

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const ZERO_PATTERN = /^0x0{40}$/;

/** Read-only list of the contract addresses this app is configured with. */
export const ContractsPanel = () => {
  const t = useT(messages);
  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle>{t('contracts.title')}</CardTitle>
        <CardDescription>{t('contracts.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className='divide-y divide-dashed'>
          {CONTRACT_ROWS.map(([name, address]) => {
            const configured =
              ADDRESS_PATTERN.test(address) && !ZERO_PATTERN.test(address);
            if (!configured && OPTIONAL_ROWS[name]) {
              return null;
            }
            return (
              <li
                className='flex flex-wrap items-center justify-between gap-2 py-2'
                key={name}
              >
                <span className='text-sm'>{name}</span>
                {configured ? (
                  <a
                    className='inline-flex items-center gap-1 break-all font-mono text-primary text-xs underline-offset-4 hover:underline'
                    href={explorerAddressUrl(address)}
                    rel='noopener noreferrer'
                    target='_blank'
                  >
                    {address}
                    <ExternalLink className='size-3 shrink-0' />
                  </a>
                ) : (
                  <span className='text-muted-foreground text-xs'>
                    {t('contracts.notConfigured')}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
};
