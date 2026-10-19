'use client';

import { useEffect, useState } from 'react';
import { CONTRACTS } from '@/config/contracts';
import { useContractInteraction } from '@/hooks/use-contract-interaction';
import {
  loadLedger,
  type ScopeTotals,
  sumByScope,
} from '@/lib/emissions-tracker';
import type { CarbonCredit } from '@/types/carb';

export type CreditsStatus = 'idle' | 'loading' | 'ready';

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const ZERO_ADDRESS_PATTERN = /^0x0{40}$/;

export const nftConfigured =
  ADDRESS_PATTERN.test(CONTRACTS.carbonCreditNFT) &&
  !ZERO_ADDRESS_PATTERN.test(CONTRACTS.carbonCreditNFT);

export interface AssessData {
  credits: CarbonCredit[];
  creditsStatus: CreditsStatus;
  /** Null until the tracker ledger has been read from localStorage. */
  emissions: ScopeTotals | null;
  recordCount: number;
}

export const useAssessData = (
  address: string | undefined,
  year: number
): AssessData => {
  const { getUserCredits } = useContractInteraction();
  const [credits, setCredits] = useState<CarbonCredit[]>([]);
  const [creditsStatus, setCreditsStatus] = useState<CreditsStatus>('idle');
  const [emissions, setEmissions] = useState<ScopeTotals | null>(null);
  const [recordCount, setRecordCount] = useState(0);

  useEffect(() => {
    if (!address) {
      setEmissions(null);
      setRecordCount(0);
      return;
    }
    const ledger = loadLedger(address, year);
    setEmissions(sumByScope(ledger.records));
    setRecordCount(ledger.records.length);
  }, [address, year]);

  useEffect(() => {
    if (!(address && nftConfigured)) {
      setCredits([]);
      setCreditsStatus('idle');
      return;
    }
    let cancelled = false;
    setCreditsStatus('loading');
    getUserCredits(address)
      .then((result) => {
        if (!cancelled) {
          setCredits(result);
          setCreditsStatus('ready');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCredits([]);
          setCreditsStatus('ready');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [address, getUserCredits]);

  return { credits, creditsStatus, emissions, recordCount };
};
