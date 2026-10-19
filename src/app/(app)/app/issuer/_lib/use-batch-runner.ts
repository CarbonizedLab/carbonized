'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { Address, Hash } from 'viem';
import { targetChain } from '@/config/wagmi';
import type { TranslateFn } from '@/lib/i18n';
import {
  batchTokenIdsFromReceipt,
  mapLimited,
  readSerialTokenized,
  sendBatchMint,
} from './issuer-chain';
import { type BatchChunk, sha256OfText } from './issuer-utils';
import { useIssuerTx } from './use-issuer-data';

export type ChunkStatus =
  | 'pending'
  | 'signing'
  | 'confirming'
  | 'done'
  | 'failed';

export interface ChunkState {
  status: ChunkStatus;
  hash?: Hash;
  tokenIds?: string[];
  error?: string;
}

interface SavedProgress {
  done: Record<string, { hash: Hash; tokenIds: string[] }>;
}

const STORAGE_PREFIX = 'carb:issuer-batch';

const storageKey = (payloadKey: string) =>
  `${STORAGE_PREFIX}:${targetChain.id}:${payloadKey}`;

const readSaved = (payloadKey: string): SavedProgress => {
  try {
    const raw = window.localStorage.getItem(storageKey(payloadKey));
    return raw ? (JSON.parse(raw) as SavedProgress) : { done: {} };
  } catch {
    return { done: {} };
  }
};

const errorMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

const bigintReplacer = (_key: string, value: unknown) =>
  typeof value === 'bigint' ? value.toString() : value;

interface BatchRunnerOptions {
  chunks: BatchChunk[];
  /** Valid recipient, or null while the field is empty / invalid. */
  recipient: Address | null;
  t: TranslateFn;
  /** Called after every run (finished, stopped or failed) so lists can refresh. */
  onIssued: () => void;
}

/**
 * Runs `batchMint` chunk by chunk. Confirmed chunks are saved in localStorage under a hash of the
 * exact payload (recipient + credits), so pasting the same CSV again after a failure, reload or
 * closed tab resumes at the first unconfirmed chunk. Double issuance is impossible regardless:
 * the contract rejects an already tokenized serial, and each chunk is pre-checked.
 */
export const useBatchRunner = ({
  chunks,
  recipient,
  t,
  onIssued,
}: BatchRunnerOptions) => {
  const { ctx } = useIssuerTx();
  const stopRef = useRef(false);
  const statesRef = useRef<Record<number, ChunkState>>({});
  const [chunkStates, setChunkStates] = useState<Record<number, ChunkState>>(
    {}
  );
  const [payloadKey, setPayloadKey] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const replaceStates = useCallback((next: Record<number, ChunkState>) => {
    statesRef.current = next;
    setChunkStates(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!recipient || chunks.length === 0) {
      setPayloadKey(null);
      replaceStates({});
      return;
    }
    const payload = JSON.stringify(
      [recipient.toLowerCase(), chunks.map((c) => [c.projectId, c.credits])],
      bigintReplacer
    );
    sha256OfText(payload).then((key) => {
      if (cancelled) {
        return;
      }
      const restored: Record<number, ChunkState> = {};
      for (const [index, entry] of Object.entries(readSaved(key).done)) {
        restored[Number(index)] = {
          status: 'done',
          hash: entry.hash,
          tokenIds: entry.tokenIds,
        };
      }
      replaceStates(restored);
      setPayloadKey(key);
    });
    return () => {
      cancelled = true;
    };
  }, [chunks, recipient, replaceStates]);

  const patchChunk = (index: number, state: ChunkState) =>
    replaceStates({ ...statesRef.current, [index]: state });

  const persistDone = (key: string) => {
    const done: SavedProgress['done'] = {};
    for (const [index, state] of Object.entries(statesRef.current)) {
      if (state.status === 'done' && state.hash && state.tokenIds) {
        done[index] = { hash: state.hash, tokenIds: state.tokenIds };
      }
    }
    try {
      window.localStorage.setItem(storageKey(key), JSON.stringify({ done }));
    } catch {
      // Storage unavailable (private mode / quota): progress is still kept in memory.
    }
  };

  const clearSaved = () => {
    if (payloadKey) {
      try {
        window.localStorage.removeItem(storageKey(payloadKey));
      } catch {
        // Nothing to clear when storage is unavailable.
      }
    }
    replaceStates({});
  };

  const runChunk = async (
    chunk: BatchChunk,
    to: Address,
    key: string
  ): Promise<boolean> => {
    if (!ctx) {
      return false;
    }
    const previous = statesRef.current[chunk.index];
    try {
      // A previous attempt may have been mined although the UI lost track of it.
      if (previous?.hash) {
        const prior = await ctx.publicClient
          .getTransactionReceipt({ hash: previous.hash })
          .catch(() => null);
        if (prior?.status === 'success') {
          patchChunk(chunk.index, {
            status: 'done',
            hash: previous.hash,
            tokenIds: batchTokenIdsFromReceipt(prior).map(String),
          });
          persistDone(key);
          return true;
        }
      }
      patchChunk(chunk.index, { status: 'signing' });
      const taken = await mapLimited(chunk.credits, (credit) =>
        readSerialTokenized(ctx.publicClient, credit.serialNumber)
      );
      const duplicates = chunk.credits
        .filter((_, index) => taken[index])
        .map((credit) => credit.serialNumber);
      if (duplicates.length > 0) {
        throw new Error(
          t('batch.alreadyTokenized', { serials: duplicates.join(', ') })
        );
      }
      const result = await sendBatchMint(
        ctx,
        to,
        chunk.projectId,
        chunk.credits,
        (hash) => patchChunk(chunk.index, { status: 'confirming', hash })
      );
      patchChunk(chunk.index, {
        status: 'done',
        hash: result.receipt.transactionHash,
        tokenIds: result.tokenIds.map(String),
      });
      persistDone(key);
      return true;
    } catch (error) {
      patchChunk(chunk.index, {
        status: 'failed',
        hash: statesRef.current[chunk.index]?.hash,
        error: errorMessage(error, t('batch.chunkFailed')),
      });
      return false;
    }
  };

  const run = async () => {
    if (!(ctx && recipient && payloadKey)) {
      return;
    }
    stopRef.current = false;
    setRunning(true);
    let completed = true;
    try {
      for (const chunk of chunks) {
        if (statesRef.current[chunk.index]?.status === 'done') {
          continue;
        }
        if (
          stopRef.current ||
          !(await runChunk(chunk, recipient, payloadKey))
        ) {
          completed = false;
          break;
        }
      }
    } finally {
      setRunning(false);
      onIssued();
    }
    if (completed) {
      toast.success(t('batch.allDone'));
    }
  };

  const stop = () => {
    stopRef.current = true;
  };

  return {
    chunkStates,
    payloadKey,
    running,
    hasWallet: Boolean(ctx),
    run,
    stop,
    clearSaved,
  };
};
