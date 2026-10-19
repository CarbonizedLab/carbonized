'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CctPool } from '@/config/cct-pools';
import { useContractInteraction } from '@/hooks/use-contract-interaction';
import type { TranslateFn } from '@/lib/i18n';
import type { CarbonCredit } from '@/types/carb';
import {
  fetchWrappedCredits,
  getEligibility,
  getTxErrorMessage,
  groupByPool,
  isUserRejection,
  type PoolGroup,
  type WrappedCredit,
} from './tokenize-utils';

export type StepIndex = 0 | 1 | 2 | 3;

export type TxStatus =
  | 'idle'
  | 'wallet'
  | 'confirming'
  | 'success'
  | 'error'
  | 'rejected';

export interface PlannedTx {
  id: string;
  kind: 'approve' | 'wrap';
  pool: CctPool;
  tokenId?: number;
  tonnes?: number;
  status: TxStatus;
  hash?: `0x${string}`;
  error?: string;
}

export interface MintedSummary {
  pool: CctPool;
  count: number;
  tonnes: number;
  /** CCT balance of the connected wallet after wrapping. */
  balance: number | null;
}

const buildPlan = (
  groups: PoolGroup[],
  approved: Record<string, boolean>
): PlannedTx[] => {
  const approvals: PlannedTx[] = [];
  const wraps: PlannedTx[] = [];
  for (const group of groups) {
    if (!approved[group.pool.address]) {
      approvals.push({
        id: `approve-${group.pool.methodology}`,
        kind: 'approve',
        pool: group.pool,
        status: 'idle',
      });
    }
    for (const credit of group.credits) {
      wraps.push({
        id: `wrap-${credit.tokenId}`,
        kind: 'wrap',
        pool: group.pool,
        tokenId: credit.tokenId,
        tonnes: credit.co2Tonnes,
        status: 'idle',
      });
    }
  }
  return [...approvals, ...wraps];
};

export const useTokenizeFlow = (t: TranslateFn) => {
  const {
    address,
    isConnected,
    publicClient,
    getUserCredits,
    getErc20Balance,
    isNftApprovedForAll,
    approveNftOperator,
    wrapCreditInPool,
  } = useContractInteraction();

  const [credits, setCredits] = useState<CarbonCredit[]>([]);
  const [wrapped, setWrapped] = useState<WrappedCredit[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number[]>([]);
  const [step, setStep] = useState<StepIndex>(0);
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  const [txs, setTxs] = useState<PlannedTx[]>([]);
  const [planGroups, setPlanGroups] = useState<PoolGroup[]>([]);
  const [running, setRunning] = useState(false);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [currentBalances, setCurrentBalances] = useState<
    Record<string, number>
  >({});
  const [reviewLoading, setReviewLoading] = useState(false);

  const load = useCallback(async () => {
    if (!(isConnected && address && publicClient)) {
      setCredits([]);
      setWrapped([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [owned, locked] = await Promise.all([
        getUserCredits(address),
        fetchWrappedCredits(publicClient, address),
      ]);
      setCredits(owned);
      setWrapped(locked);
    } finally {
      setLoading(false);
    }
  }, [isConnected, address, publicClient, getUserCredits]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedCredits = useMemo(
    () => credits.filter((credit) => selected.includes(credit.tokenId)),
    [credits, selected]
  );
  const groups = useMemo(() => groupByPool(selectedCredits), [selectedCredits]);
  const eligible = useMemo(
    () => credits.filter((credit) => getEligibility(credit).blocked === null),
    [credits]
  );

  const toggle = useCallback((tokenId: number) => {
    setSelected((prev) =>
      prev.includes(tokenId)
        ? prev.filter((id) => id !== tokenId)
        : [...prev, tokenId]
    );
  }, []);

  const setSelection = useCallback((tokenIds: number[]) => {
    setSelected(tokenIds);
  }, []);

  const checkApprovals = useCallback(
    async (poolGroups: PoolGroup[]) => {
      if (!address) {
        return {};
      }
      const entries = await Promise.all(
        poolGroups.map(
          async ({ pool }) =>
            [
              pool.address,
              await isNftApprovedForAll(address, pool.address),
            ] as const
        )
      );
      const result = Object.fromEntries(entries);
      setApproved(result);
      return result;
    },
    [address, isNftApprovedForAll]
  );

  /** Review -> execute: refresh approvals and freeze the transaction plan. */
  const prepareExecution = useCallback(async () => {
    const status = await checkApprovals(groups);
    setPlanGroups(groups);
    setTxs(buildPlan(groups, status));
    setStep(2);
  }, [checkApprovals, groups]);

  const patchTx = useCallback((id: string, patch: Partial<PlannedTx>) => {
    setTxs((prev) =>
      prev.map((tx) => (tx.id === id ? { ...tx, ...patch } : tx))
    );
  }, []);

  const runTx = useCallback(
    async (tx: PlannedTx): Promise<boolean> => {
      patchTx(tx.id, { status: 'wallet', error: undefined, hash: undefined });
      try {
        const hash =
          tx.kind === 'approve'
            ? await approveNftOperator(tx.pool.address)
            : await wrapCreditInPool(tx.pool.address, tx.tokenId as number);
        patchTx(tx.id, { status: 'confirming', hash });
        const receipt = await publicClient?.waitForTransactionReceipt({ hash });
        if (receipt && receipt.status !== 'success') {
          throw new Error(t('tx.reverted'));
        }
        patchTx(tx.id, { status: 'success' });
        return true;
      } catch (error) {
        const rejected = isUserRejection(error);
        patchTx(tx.id, {
          status: rejected ? 'rejected' : 'error',
          error: rejected
            ? undefined
            : getTxErrorMessage(error, t('tx.failed')),
        });
        return false;
      }
    },
    [approveNftOperator, wrapCreditInPool, publicClient, patchTx, t]
  );

  const loadBalances = useCallback(
    async (pools: CctPool[]) => {
      if (!address) {
        return;
      }
      const entries = await Promise.all(
        pools.map(
          async (pool) =>
            [
              pool.address,
              await getErc20Balance(pool.address, address),
            ] as const
        )
      );
      setBalances(Object.fromEntries(entries));
    },
    [address, getErc20Balance]
  );

  // Review step: load per-pool approvals and current CCT balances for the preview.
  useEffect(() => {
    if (step !== 1 || !address) {
      return;
    }
    let cancelled = false;
    setReviewLoading(true);
    Promise.all([
      checkApprovals(groups),
      Promise.all(
        groups.map(
          async ({ pool }) =>
            [
              pool.address,
              await getErc20Balance(pool.address, address),
            ] as const
        )
      ),
    ])
      .then(([, entries]) => {
        if (!cancelled) {
          setCurrentBalances(Object.fromEntries(entries));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setReviewLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [step, address, groups, checkApprovals, getErc20Balance]);

  const finish = useCallback(async () => {
    const pools = planGroups.map((group) => group.pool);
    await Promise.all([loadBalances(pools), load()]);
    setStep(3);
  }, [planGroups, loadBalances, load]);

  /** Runs every not-yet-successful transaction in order, stopping at the first failure. */
  const runPlan = useCallback(async () => {
    setRunning(true);
    let allDone = true;
    for (const tx of txs) {
      if (tx.status === 'success') {
        continue;
      }
      const ok = await runTx(tx);
      if (!ok) {
        allDone = false;
        break;
      }
    }
    setRunning(false);
    if (allDone) {
      await finish();
    }
  }, [txs, runTx, finish]);

  const minted = useMemo<MintedSummary[]>(() => {
    const summaries: MintedSummary[] = [];
    for (const group of planGroups) {
      const done = txs.filter(
        (tx) =>
          tx.kind === 'wrap' &&
          tx.status === 'success' &&
          tx.pool.address === group.pool.address
      );
      if (done.length === 0) {
        continue;
      }
      summaries.push({
        pool: group.pool,
        count: done.length,
        tonnes: done.reduce((sum, tx) => sum + (tx.tonnes ?? 0), 0),
        balance: balances[group.pool.address] ?? null,
      });
    }
    return summaries;
  }, [planGroups, txs, balances]);

  const hasWrapped = txs.some(
    (tx) => tx.kind === 'wrap' && tx.status === 'success'
  );

  const reset = useCallback(() => {
    setSelected([]);
    setTxs([]);
    setPlanGroups([]);
    setApproved({});
    setBalances({});
    setStep(0);
    load();
  }, [load]);

  return {
    address,
    isConnected,
    loading,
    credits,
    wrapped,
    eligible,
    selected,
    selectedCredits,
    groups,
    step,
    setStep,
    approved,
    currentBalances,
    reviewLoading,
    txs,
    running,
    minted,
    hasWrapped,
    toggle,
    setSelection,
    checkApprovals,
    prepareExecution,
    runPlan,
    finish,
    reset,
    reload: load,
  };
};
