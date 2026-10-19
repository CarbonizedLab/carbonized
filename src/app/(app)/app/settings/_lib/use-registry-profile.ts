'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useContractInteraction } from '@/hooks/use-contract-interaction';
import {
  isRegistryConfigured,
  type OnchainCompany,
  type OnchainTrader,
  type RegistrationType,
  readRegistrationType,
} from '@/lib/registry';

export interface RegistryProfile {
  registration: RegistrationType;
  company: OnchainCompany | null;
  trader: OnchainTrader | null;
  /** True when the connected wallet holds VERIFIER_ROLE on the registry. */
  isVerifier: boolean;
}

export type RegistryProfileState =
  | { status: 'unconfigured' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; profile: RegistryProfile };

/** Reads the connected wallet's registry profile, KYB flag and verifier role. */
export const useRegistryProfile = (
  account: string | undefined
): { state: RegistryProfileState; reload: () => void } => {
  const { publicClient, getCompanyData, getTraderData, hasVerifierRole } =
    useContractInteraction();
  const [state, setState] = useState<RegistryProfileState>({
    status: 'loading',
  });
  const runId = useRef(0);

  const load = useCallback(async () => {
    runId.current += 1;
    const id = runId.current;
    if (!isRegistryConfigured()) {
      setState({ status: 'unconfigured' });
      return;
    }
    if (!(account && publicClient)) {
      return;
    }
    setState({ status: 'loading' });
    try {
      const registration = await readRegistrationType(publicClient, account);
      const [company, trader, isVerifier] = await Promise.all([
        registration === 'company' ? getCompanyData(account) : null,
        registration === 'trader' ? getTraderData(account) : null,
        hasVerifierRole(account),
      ]);
      if (id === runId.current) {
        setState({
          status: 'ready',
          profile: { registration, company, trader, isVerifier },
        });
      }
    } catch (error) {
      if (id === runId.current) {
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }, [account, publicClient, getCompanyData, getTraderData, hasVerifierRole]);

  useEffect(() => {
    load();
    return () => {
      runId.current += 1;
    };
  }, [load]);

  return { state, reload: load };
};
