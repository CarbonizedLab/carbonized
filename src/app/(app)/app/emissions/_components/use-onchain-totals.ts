'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useContractInteraction } from '@/hooks/use-contract-interaction';
import type { ScopeTotals } from '@/lib/emissions-tracker';
import { useT } from '@/lib/i18n';
import { isRegistryConfigured } from '@/lib/registry';
import { messages } from '../_messages';

export interface OnChainTotals {
  scope1: number;
  scope2: number;
  scope3: number;
}

export type OnChainStatus = 'loading' | 'ready' | 'unavailable';

const DECIMALS = 1000;

const roundTonnes = (value: number): number =>
  Math.round(value * DECIMALS) / DECIMALS;

export const useOnChainTotals = (address: string | undefined) => {
  const t = useT(messages);
  const { getCompanyEmissions, updateEmissions } = useContractInteraction();

  const [totals, setTotals] = useState<OnChainTotals | null>(null);
  const [status, setStatus] = useState<OnChainStatus>('loading');
  const [isSyncing, setIsSyncing] = useState(false);

  const configured = isRegistryConfigured();

  const refresh = useCallback(async () => {
    if (!(address && configured)) {
      setTotals(null);
      setStatus('unavailable');
      return;
    }
    setStatus('loading');
    const result = await getCompanyEmissions(address);
    if (result) {
      setTotals({
        scope1: result.scope1,
        scope2: result.scope2,
        scope3: result.scope3,
      });
      setStatus('ready');
      return;
    }
    setTotals(null);
    setStatus('unavailable');
  }, [address, configured, getCompanyEmissions]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // `updateEmissions` simulates, sends and waits for the receipt; it throws a
  // readable Error on revert/rejection and resolves null without a wallet.
  const sync = async (source: ScopeTotals) => {
    setIsSyncing(true);
    try {
      const hash = await updateEmissions(
        roundTonnes(source.scope1),
        roundTonnes(source.scope2),
        roundTonnes(source.scope3)
      );
      if (!hash) {
        toast.error(t('sync.failed'));
        return;
      }
      await refresh();
      toast.success(t('sync.confirmed'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('sync.failed'));
    } finally {
      setIsSyncing(false);
    }
  };

  return { totals, status, isSyncing, configured, refresh, sync };
};
