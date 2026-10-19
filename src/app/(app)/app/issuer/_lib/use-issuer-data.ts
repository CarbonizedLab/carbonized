'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { Address } from 'viem';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { targetChain } from '@/config/wagmi';
import {
  fetchIssuedCredits,
  fetchIssuerList,
  isNftConfigured,
  mapLimited,
  readNftRoles,
  readSerialTokenized,
  readTargetLookup,
  type TargetLookup,
  type TxContext,
} from './issuer-chain';
import { canonicalSerial } from './issuer-utils';

/** `hasRole` checks for the connected wallet (NATIVE_ISSUER_ROLE, DEFAULT_ADMIN_ROLE) and the pause flag. */
export const useNftRoles = (account: Address | undefined) => {
  const publicClient = usePublicClient();
  return useQuery({
    queryKey: ['nft-roles', targetChain.id, account],
    enabled: Boolean(publicClient && account && isNftConfigured()),
    staleTime: 15_000,
    queryFn: () => {
      if (!(publicClient && account)) {
        throw new Error('Wallet or RPC client unavailable');
      }
      return readNftRoles(publicClient, account);
    },
  });
};

/** Public list of current NATIVE_ISSUER_ROLE holders. */
export const useIssuerList = () => {
  const publicClient = usePublicClient();
  return useQuery({
    queryKey: ['nft-issuers', targetChain.id],
    enabled: Boolean(publicClient && isNftConfigured()),
    staleTime: 30_000,
    queryFn: () => {
      if (!publicClient) {
        throw new Error('RPC client unavailable');
      }
      return fetchIssuerList(publicClient);
    },
  });
};

/** Latest issued credits, optionally for one recipient. */
export const useIssuedCredits = (recipient: Address | undefined) => {
  const publicClient = usePublicClient();
  return useQuery({
    queryKey: ['nft-issued', targetChain.id, recipient ?? 'all'],
    enabled: Boolean(publicClient && isNftConfigured()),
    staleTime: 15_000,
    queryFn: () => {
      if (!publicClient) {
        throw new Error('RPC client unavailable');
      }
      return fetchIssuedCredits(publicClient, recipient);
    },
  });
};

interface IssuerTxState {
  /** Null until the wallet and RPC clients are ready. */
  ctx: TxContext | null;
  /** The wallet is connected to a chain other than the configured target chain. */
  wrongNetwork: boolean;
}

/** Everything a write needs: public + wallet client and the account, plus a network check. */
export const useIssuerTx = (): IssuerTxState => {
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

export type SerialStatus = 'idle' | 'checking' | 'free' | 'taken' | 'error';

const SERIAL_DEBOUNCE_MS = 400;

/** Debounced live `isSerialTokenized` lookup for a typed serial. */
export const useSerialCheck = (serial: string): SerialStatus => {
  const publicClient = usePublicClient();
  const [debounced, setDebounced] = useState(serial);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(serial), SERIAL_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [serial]);

  const query = useQuery({
    queryKey: ['nft-serial-check', targetChain.id, canonicalSerial(debounced)],
    enabled: Boolean(
      publicClient && isNftConfigured() && canonicalSerial(debounced) !== ''
    ),
    staleTime: 0,
    gcTime: 0,
    queryFn: () => {
      if (!publicClient) {
        throw new Error('RPC client unavailable');
      }
      return readSerialTokenized(publicClient, debounced);
    },
  });

  if (canonicalSerial(serial) === '') {
    return 'idle';
  }
  if (
    canonicalSerial(debounced) !== canonicalSerial(serial) ||
    query.isFetching
  ) {
    return 'checking';
  }
  if (query.isError) {
    return 'error';
  }
  if (query.data === undefined) {
    return 'checking';
  }
  return query.data ? 'taken' : 'free';
};

/** Role + code lookup for an address typed into the role admin form. */
export const useTargetLookup = (value: string, valid: boolean) => {
  const publicClient = usePublicClient();
  return useQuery<TargetLookup>({
    queryKey: ['issuer-target', targetChain.id, value.toLowerCase()],
    enabled: Boolean(publicClient && valid && isNftConfigured()),
    staleTime: 5000,
    queryFn: () => {
      if (!publicClient) {
        throw new Error('RPC client unavailable');
      }
      return readTargetLookup(publicClient, value as Address);
    },
  });
};

export type ChainStatus = 'checking' | 'free' | 'taken' | 'error';

/**
 * Read-only `isSerialTokenized` check for every serial in a CSV. `serialsKey` is a JSON array of
 * serials; results are keyed by canonical serial and cached for the lifetime of the component,
 * so editing one row only re-checks the serials that changed.
 */
export const useSerialChainStatus = (
  serialsKey: string
): Record<string, ChainStatus> => {
  const publicClient = usePublicClient();
  const cache = useRef<Record<string, ChainStatus>>({});
  const [status, setStatus] = useState<Record<string, ChainStatus>>({});

  useEffect(() => {
    if (!publicClient) {
      return;
    }
    const todo = (JSON.parse(serialsKey) as string[]).filter((serial) => {
      const current = cache.current[canonicalSerial(serial)];
      return (
        current === undefined || current === 'error' || current === 'checking'
      );
    });
    if (todo.length === 0) {
      return;
    }
    let cancelled = false;
    for (const serial of todo) {
      cache.current[canonicalSerial(serial)] = 'checking';
    }
    setStatus({ ...cache.current });
    mapLimited(todo, async (serial) => {
      let next: ChainStatus = 'error';
      try {
        next = (await readSerialTokenized(publicClient, serial))
          ? 'taken'
          : 'free';
      } catch {
        next = 'error';
      }
      cache.current[canonicalSerial(serial)] = next;
      if (!cancelled) {
        setStatus({ ...cache.current });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [serialsKey, publicClient]);

  return status;
};
