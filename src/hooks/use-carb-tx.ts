'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { Hash, TransactionReceipt } from 'viem';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { targetChain } from '@/config/wagmi';
import { CARB_QUERY_KEY } from '@/hooks/use-carb-data';
import {
  nowSeconds,
  type TxCallbacks,
  type TxContext,
  type TxStage,
} from '@/lib/carb';
import { carbErrorMessages } from '@/lib/carb-errors';
import { useT } from '@/lib/i18n';

const TICK_MS = 1000;

interface KarbTxState {
  /** Null until the wallet and RPC clients are ready. */
  ctx: TxContext | null;
  /** The wallet is connected to a chain other than the configured target chain. */
  wrongNetwork: boolean;
}

/** Everything a CARB write needs: public + wallet client and the account, plus a network check. */
export const useKarbTx = (): KarbTxState => {
  const { address, chain } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const wrongNetwork = chain !== undefined && chain.id !== targetChain.id;
  return {
    ctx:
      address && publicClient && walletClient
        ? { publicClient, walletClient, account: address }
        : null,
    wrongNetwork,
  };
};

/** Translates a revert reason raised by a CARB contract; unknown reasons come back unchanged. */
export const useKarbErrorText = (): ((message: string) => string) => {
  const t = useT(carbErrorMessages);
  return (message) => {
    const key = `revert.${message}`;
    const translated = t(key);
    return translated === key ? message : translated;
  };
};

/** Unix seconds of the client clock, refreshed every second (for countdowns). */
export const useNowSeconds = (): number => {
  const [now, setNow] = useState(nowSeconds);
  useEffect(() => {
    const id = window.setInterval(() => setNow(nowSeconds()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);
  return now;
};

interface TxRunner {
  /** A transaction flow is running (wallet prompt or waiting for the receipt). */
  pending: boolean;
  /** Current step of a multi-transaction flow (approve, then send). */
  stage: TxStage | null;
  /** Hash of the latest submitted transaction. */
  hash: Hash | null;
  error: string | null;
  /**
   * Runs one flow. Resolves `true` after a mined success (toast shown, CARB queries refreshed,
   * plus `extraKeys`), `false` after a failure (message in `error`).
   */
  run: (
    action: (callbacks: TxCallbacks) => Promise<TransactionReceipt>,
    successMessage: string,
    extraKeys?: readonly (readonly string[])[]
  ) => Promise<boolean>;
}

/** Shared pending / error / hash state for the CARB write panels. */
export const useTxRunner = (): TxRunner => {
  const queryClient = useQueryClient();
  const errorText = useKarbErrorText();
  const [pending, setPending] = useState(false);
  const [stage, setStage] = useState<TxStage | null>(null);
  const [hash, setHash] = useState<Hash | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run: TxRunner['run'] = async (
    action,
    successMessage,
    extraKeys = []
  ) => {
    setPending(true);
    setError(null);
    setHash(null);
    setStage(null);
    try {
      const receipt = await action({ onSubmitted: setHash, onStage: setStage });
      setHash(receipt.transactionHash);
      toast.success(successMessage);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [CARB_QUERY_KEY] }),
        ...extraKeys.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey: [...queryKey] })
        ),
      ]);
      return true;
    } catch (caught) {
      setError(
        errorText(caught instanceof Error ? caught.message : 'Unknown error')
      );
      return false;
    } finally {
      setPending(false);
      setStage(null);
    }
  };

  return { pending, stage, hash, error, run };
};
