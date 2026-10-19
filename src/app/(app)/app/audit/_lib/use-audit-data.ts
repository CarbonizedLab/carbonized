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
import {
  buildChecks,
  type ChainSnapshot,
  isConfiguredAddress,
  type ReconCheck,
  readChainSnapshot,
} from './reconcile';

export interface AuditData {
  events: ChainEvent[];
  checks: ReconCheck[];
  snapshot: ChainSnapshot;
  /** Event-scan and contract-read failures. */
  errors: string[];
  latestBlock: bigint;
  fromBlock: bigint;
  /** True when the scan starts at `NEXT_PUBLIC_DEPLOY_BLOCK` (or genesis), i.e. should cover all history. */
  coversDeployment: boolean;
  loadedAt: number;
}

export type AuditState =
  | { status: 'unconfigured' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: AuditData };

/**
 * Scans events and reads contract counters pinned to the same block, so a
 * transaction landing mid-load cannot cause a false mismatch.
 */
const loadAuditData = async (client: PublicClient): Promise<AuditState> => {
  try {
    const latestBlock = await client.getBlockNumber();
    const fromBlock = resolveFromBlock(latestBlock);
    const [{ events, errors }, snapshot] = await Promise.all([
      fetchChainEvents(client, { fromBlock, toBlock: latestBlock }),
      readChainSnapshot(client, latestBlock),
    ]);
    return {
      status: 'ready',
      data: {
        events,
        checks: buildChecks(events, snapshot),
        snapshot,
        errors: [...errors, ...snapshot.errors],
        latestBlock,
        fromBlock,
        coversDeployment: scanCoversDeployment(fromBlock),
        loadedAt: Date.now(),
      },
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

export const useAuditData = (): { state: AuditState; reload: () => void } => {
  const client = usePublicClient();
  const [state, setState] = useState<AuditState>({ status: 'loading' });
  const runId = useRef(0);

  const load = useCallback(async () => {
    runId.current += 1;
    const id = runId.current;
    if (!isConfiguredAddress(CONTRACTS.carbonCreditNFT)) {
      setState({ status: 'unconfigured' });
      return;
    }
    if (!client) {
      return;
    }
    setState({ status: 'loading' });
    const next = await loadAuditData(client);
    if (id === runId.current) {
      setState(next);
    }
  }, [client]);

  useEffect(() => {
    load();
    return () => {
      runId.current += 1;
    };
  }, [load]);

  return { state, reload: load };
};
