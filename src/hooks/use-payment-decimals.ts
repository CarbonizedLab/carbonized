'use client';

import { useQuery } from '@tanstack/react-query';
import { usePublicClient } from 'wagmi';
import { CONTRACTS } from '@/config/contracts';
import { readTokenDecimals } from '@/lib/token-units';

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

/**
 * `decimals()` of the payment token, read once from the chain and cached
 * for the session. `decimals` stays `undefined` until the read succeeds, and
 * `isError` is true when it fails: callers MUST NOT transact or format prices
 * while it is undefined (never fall back to 18).
 */
export const usePaymentDecimals = () => {
  const publicClient = usePublicClient();
  const enabled = Boolean(publicClient) && ADDRESS_REGEX.test(CONTRACTS.usdc);

  const query = useQuery<number>({
    queryKey: [
      'payment-token-decimals',
      publicClient?.chain?.id,
      CONTRACTS.usdc,
    ],
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    retry: 2,
    queryFn: () => {
      if (!publicClient) {
        throw new Error('No RPC client available');
      }
      return readTokenDecimals(publicClient, CONTRACTS.usdc);
    },
  });

  return {
    decimals: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
  };
};
