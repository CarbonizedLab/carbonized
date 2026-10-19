'use client';

import { Wallet } from 'lucide-react';
import { useAccount } from 'wagmi';
import { EmptyState } from '@/components/app/empty-state';
import { useT } from '@/lib/i18n';
import { KybChecklist } from './_components/kyb-checklist';
import { KybVerification } from './_components/kyb-verification';
import { OrgProfilePanel } from './_components/org-profile-panel';
import {
  ContractsPanel,
  PreferencesPanel,
} from './_components/preferences-panel';
import { WalletPanel } from './_components/wallet-panel';
import { useRegistryProfile } from './_lib/use-registry-profile';
import { messages } from './_messages';

const SettingsPage = () => {
  const t = useT(messages);
  const { address, isConnected } = useAccount();
  const { state, reload } = useRegistryProfile(
    isConnected ? address : undefined
  );

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='font-semibold text-2xl tracking-tight'>
          {t('page.title')}
        </h1>
        <p className='max-w-2xl text-muted-foreground'>{t('page.subtitle')}</p>
      </div>

      {isConnected && address ? (
        <div className='grid items-start gap-6 lg:grid-cols-2'>
          <div className='space-y-6'>
            <KybVerification
              account={address}
              onChanged={reload}
              profile={state.status === 'ready' ? state.profile : null}
            />
            <KybChecklist account={address} />
          </div>
          <div className='space-y-6'>
            <WalletPanel account={address} />
            <OrgProfilePanel state={state} />
            <PreferencesPanel />
            <ContractsPanel />
          </div>
        </div>
      ) : (
        <div className='grid items-start gap-6 lg:grid-cols-2'>
          <EmptyState
            description={t('connect.description')}
            icon={<Wallet className='size-12' />}
            title={t('connect.title')}
          />
          <div className='space-y-6'>
            <PreferencesPanel />
            <ContractsPanel />
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
