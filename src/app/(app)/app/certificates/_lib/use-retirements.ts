'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicClient } from 'viem';
import { usePublicClient } from 'wagmi';
import { CONTRACTS } from '@/config/contracts';
import {
  type ChainEvent,
  fetchChainEvents,
  resolveFromBlock,
  scanCoversDeployment,
} from '@/lib/onchain-events';

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export interface RetirementList {
  /** Retire events for the account, newest first. */
  events: ChainEvent[];
  fromBlock: bigint;
  latestBlock: bigint;
  coversDeployment: boolean;
}

export type RetirementsState =
  | { status: 'unconfigured' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: RetirementList };

/** Scans the chain for the account's retirements; resolves to a terminal state. */
const fetchRetirements = async (
  client: PublicClient,
  account: string
): Promise<RetirementsState> => {
  try {
    const latestBlock = await client.getBlockNumber();
    const fromBlock = resolveFromBlock(latestBlock);
    const { events, errors } = await fetchChainEvents(client, {
      account,
      kinds: ['retire'],
      fromBlock,
    });
    if (events.length === 0 && errors.length > 0) {
      return { status: 'error', message: errors.join('; ') };
    }
    return {
      status: 'ready',
      data: {
        events,
        fromBlock,
        latestBlock,
        coversDeployment: scanCoversDeployment(fromBlock),
      },
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/** Loads the account's onchain retirements (`CreditRetired` events). */
export const useRetirements = (
  account: string | undefined
): { state: RetirementsState; reload: () => void } => {
  const client = usePublicClient();
  const [state, setState] = useState<RetirementsState>({ status: 'loading' });
  const runId = useRef(0);

  const load = useCallback(async () => {
    runId.current += 1;
    const id = runId.current;
    if (!ADDRESS_PATTERN.test(CONTRACTS.carbonCreditNFT)) {
      setState({ status: 'unconfigured' });
      return;
    }
    if (!(client && account)) {
      return;
    }
    setState({ status: 'loading' });
    const next = await fetchRetirements(client, account);
    if (id === runId.current) {
      setState(next);
    }
  }, [client, account]);

  useEffect(() => {
    load();
    return () => {
      runId.current += 1;
    };
  }, [load]);

  return { state, reload: load };
};
