'use client';

import { AlertTriangle, Layers, Wallet } from 'lucide-react';
import { useState } from 'react';
import { EmptyState } from '@/components/app/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WalletButton } from '@/components/web3/wallet-button';
import { CCT_POOL_LIST, isPoolConfigured } from '@/config/cct-pools';
import { CONTRACTS } from '@/config/contracts';
import { useT } from '@/lib/i18n';
import { useTokenizeFlow } from '../_lib/use-tokenize-flow';
import { messages } from '../_messages';
import { ExecuteStep } from './execute-step';
import { NoCredits } from './no-credits';
import { ReviewStep } from './review-step';
import { SelectStep } from './select-step';
import { Stepper, type StepperStep } from './stepper';
import { SuccessStep } from './success-step';
import { UnwrapPanel } from './unwrap-panel';

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

const isConfigured =
  ADDRESS_REGEX.test(CONTRACTS.carbonCreditNFT) &&
  CCT_POOL_LIST.some(isPoolConfigured);

const STEP_KEYS = ['select', 'review', 'wrap', 'done'] as const;

export const TokenizeWizard = () => {
  const t = useT(messages);
  const flow = useTokenizeFlow(t);
  const [tab, setTab] = useState('tokenize');
  const [preparing, setPreparing] = useState(false);

  const steps: StepperStep[] = STEP_KEYS.map((key) => ({
    key,
    label: t(`step.${key}`),
    description: t(`step.${key}.desc`),
  }));

  const handleConfirm = async () => {
    setPreparing(true);
    try {
      await flow.prepareExecution();
    } finally {
      setPreparing(false);
    }
  };

  const selectedTonnes = flow.selectedCredits.reduce(
    (sum, credit) => sum + credit.co2Tonnes,
    0
  );

  const renderBody = () => {
    if (!isConfigured) {
      return (
        <EmptyState
          description={t('gate.config.description')}
          icon={<AlertTriangle className='size-12' />}
          title={t('gate.config.title')}
        />
      );
    }
    if (!flow.isConnected) {
      return (
        <EmptyState
          action={<WalletButton />}
          description={t('gate.wallet.description')}
          icon={<Wallet className='size-12' />}
          title={t('gate.wallet.title')}
        />
      );
    }
    return null;
  };

  const gate = renderBody();
  const showNoCredits =
    flow.step === 0 &&
    !flow.loading &&
    flow.credits.length === 0 &&
    flow.wrapped.length === 0;

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='flex items-center gap-2 font-semibold text-2xl tracking-tight'>
          <Layers className='size-6 text-primary' />
          {t('page.title')}
        </h1>
        <p className='text-muted-foreground'>{t('page.subtitle')}</p>
      </div>

      {gate ?? (
        <Tabs onValueChange={setTab} value={tab}>
          <TabsList>
            <TabsTrigger value='tokenize'>{t('tab.tokenize')}</TabsTrigger>
            <TabsTrigger value='unwrap'>
              {t('tab.unwrap')}
              {flow.wrapped.length > 0 ? ` (${flow.wrapped.length})` : ''}
            </TabsTrigger>
          </TabsList>

          <TabsContent className='space-y-6 pt-4' value='tokenize'>
            {showNoCredits ? (
              <NoCredits t={t} />
            ) : (
              <>
                <Stepper
                  current={flow.step}
                  label={t('page.stepsLabel')}
                  steps={steps}
                />
                {flow.step === 0 ? (
                  <SelectStep
                    credits={flow.credits}
                    eligible={flow.eligible}
                    loading={flow.loading}
                    onGoUnwrap={() => setTab('unwrap')}
                    onNext={() => flow.setStep(1)}
                    onSelection={flow.setSelection}
                    onToggle={flow.toggle}
                    selected={flow.selected}
                    selectedTonnes={selectedTonnes}
                    t={t}
                    wrapped={flow.wrapped}
                  />
                ) : null}
                {flow.step === 1 ? (
                  <ReviewStep
                    approved={flow.approved}
                    currentBalances={flow.currentBalances}
                    groups={flow.groups}
                    loading={flow.reviewLoading}
                    onBack={() => flow.setStep(0)}
                    onConfirm={handleConfirm}
                    preparing={preparing}
                    t={t}
                  />
                ) : null}
                {flow.step === 2 ? (
                  <ExecuteStep
                    hasWrapped={flow.hasWrapped}
                    onBack={() => flow.setStep(1)}
                    onFinishPartial={flow.finish}
                    onStart={flow.runPlan}
                    running={flow.running}
                    t={t}
                    txs={flow.txs}
                  />
                ) : null}
                {flow.step === 3 ? (
                  <SuccessStep
                    minted={flow.minted}
                    onReset={flow.reset}
                    t={t}
                    txs={flow.txs}
                  />
                ) : null}
              </>
            )}
          </TabsContent>

          <TabsContent className='pt-4' value='unwrap'>
            <UnwrapPanel
              loading={flow.loading}
              onChanged={flow.reload}
              t={t}
              wrapped={flow.wrapped}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};
