'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CONTRACTS } from '@/config/contracts';
import { useContractInteraction } from '@/hooks/use-contract-interaction';
import { notifyTradeSuccess } from '@/lib/carb-notifications';
import type { TranslateFn } from '@/lib/i18n';
import { getMarketplaceRevert } from '@/lib/marketplace-errors';
import {
  CCT_DECIMALS,
  formatAmountInput,
  orderCostCeil,
  toDisplayNumber,
} from '@/lib/token-units';
import {
  getErrorMessage,
  isFillable,
  isWalletRejection,
  type OrderRow,
  toOrderRow,
} from './market-utils';

const NOW_TICK_MS = 30_000;

/** Current unix time in seconds, refreshed every 30s so relative expiries stay live. */
const useNowSeconds = () => {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = window.setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      NOW_TICK_MS
    );
    return () => window.clearInterval(id);
  }, []);
  return now;
};

const describeFillError = (error: unknown, t: TranslateFn): string => {
  if (isWalletRejection(error)) {
    return t('toast.rejected');
  }
  if (getMarketplaceRevert(error) === 'cannotFillOwnOrder') {
    return t('error.cannotFillOwnOrder');
  }
  return getErrorMessage(error, t('toast.txFailed'));
};

export const useMarketplace = (translate: TranslateFn) => {
  // `translate` is a new closure every render; keep a stable wrapper so callbacks do not churn.
  const translateRef = useRef(translate);
  translateRef.current = translate;
  const t = useCallback<TranslateFn>(
    (key, vars) => translateRef.current(key, vars),
    []
  );

  const {
    getMarketplaceOrders,
    getUserOrders,
    fillOrder,
    cancelOrder,
    ensureErc20Allowance,
    getErc20BalanceWei,
    getPaymentDecimals,
    isConnected,
    address,
    publicClient,
  } = useContractInteraction();

  const now = useNowSeconds();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [myOrders, setMyOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [usdcBalanceWei, setUsdcBalanceWei] = useState<bigint | null>(null);
  const [cctBalanceWei, setCctBalanceWei] = useState<bigint | null>(null);
  const [paymentDecimals, setPaymentDecimals] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filling, setFilling] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const loadOrders = useCallback(async () => {
    try {
      const data = await getMarketplaceOrders();
      setOrders(data.map(toOrderRow));
      setLoadFailed(false);
    } catch (error) {
      setLoadFailed(true);
      toast.error(
        t('toast.loadFailed', {
          reason: getErrorMessage(error, t('toast.txFailed')),
        })
      );
    } finally {
      setLoading(false);
    }
  }, [getMarketplaceOrders, t]);

  const loadMine = useCallback(async () => {
    if (!address) {
      setMyOrders([]);
      return;
    }
    const data = await getUserOrders(address);
    setMyOrders(data.map(toOrderRow).sort((a, b) => b.id - a.id));
  }, [address, getUserOrders]);

  const loadBalances = useCallback(async () => {
    if (!(isConnected && address)) {
      setUsdcBalanceWei(null);
      setCctBalanceWei(null);
      return;
    }
    const [usdc, cct, decimals] = await Promise.all([
      getErc20BalanceWei(CONTRACTS.usdc, address),
      getErc20BalanceWei(CONTRACTS.carbonCreditToken, address),
      getPaymentDecimals().catch(() => null),
    ]);
    setUsdcBalanceWei(usdc);
    setCctBalanceWei(cct);
    setPaymentDecimals(decimals);
  }, [isConnected, address, getErc20BalanceWei, getPaymentDecimals]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadOrders(), loadMine(), loadBalances()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadOrders, loadMine, loadBalances]);

  useEffect(() => {
    if (!publicClient) {
      return;
    }
    refresh();
  }, [publicClient, refresh]);

  const listings = useMemo(
    () => orders.filter((row) => !row.isBuyOrder && isFillable(row, now)),
    [orders, now]
  );
  const buyRequests = useMemo(
    () => orders.filter((row) => row.isBuyOrder && isFillable(row, now)),
    [orders, now]
  );

  // Selling CCT to a buyer needs CCT approval; buying from a seller needs USDG approval.
  // The needed amount is computed in bigint (USDG rounded up), the allowance is
  // re-read right before approving, and exactly that amount is approved.
  const ensureApproval = useCallback(
    async (listing: OrderRow, amountWei: bigint, toastId: string | number) => {
      const token = listing.isBuyOrder
        ? CONTRACTS.carbonCreditToken
        : CONTRACTS.usdc;
      const label = listing.isBuyOrder ? 'CCT' : 'USDG';
      const needed = listing.isBuyOrder
        ? amountWei
        : orderCostCeil(amountWei, listing.priceWei);
      const ok = await ensureErc20Allowance(token, needed, () =>
        toast.loading(t('toast.approving', { token: label }), { id: toastId })
      );
      if (!ok) {
        throw new Error(t('toast.approveFailed', { token: label }));
      }
      toast.success(t('toast.approved', { token: label }), { id: toastId });
    },
    [ensureErc20Allowance, t]
  );

  /** Approves if needed, fills `amountWei` CCT base units and waits for the receipt. Returns true on success. */
  const fill = useCallback(
    async (listing: OrderRow, amountWei: bigint): Promise<boolean> => {
      if (!isConnected) {
        toast.error(t('toast.connectFirst'));
        return false;
      }
      setFilling(true);
      const toastId = toast.loading(t('toast.processing'));
      const amount = formatAmountInput(amountWei, CCT_DECIMALS);
      try {
        if (amountWei <= 0n || amountWei > listing.availableWei) {
          throw new Error(
            t('toast.tooMuch', {
              amount,
              available: formatAmountInput(listing.availableWei, CCT_DECIMALS),
            })
          );
        }
        await ensureApproval(listing, amountWei, toastId);
        toast.loading(t('toast.filling'), { id: toastId });
        const tx = await fillOrder(listing.id, amountWei);
        if (!tx) {
          throw new Error(t('toast.fillFailed'));
        }
        const receipt = await publicClient?.waitForTransactionReceipt({
          hash: tx,
        });
        if (receipt && receipt.status !== 'success') {
          throw new Error(t('toast.fillFailed'));
        }
        toast.success(
          listing.isBuyOrder
            ? t('toast.sold', { amount })
            : t('toast.bought', { amount }),
          { id: toastId }
        );
        notifyTradeSuccess(
          listing.isBuyOrder ? 'sell' : 'buy',
          toDisplayNumber(amountWei, CCT_DECIMALS),
          listing.pricePerTonne,
          tx
        );
        await refresh();
        return true;
      } catch (error) {
        const message = describeFillError(error, t);
        toast.error(message, { id: toastId });
        return false;
      } finally {
        setFilling(false);
      }
    },
    [isConnected, ensureApproval, fillOrder, publicClient, refresh, t]
  );

  /** Cancels an order and refunds the locked CCT / USDG. Returns true on success. */
  const cancel = useCallback(
    async (orderId: number): Promise<boolean> => {
      setCancellingId(orderId);
      const toastId = toast.loading(t('toast.cancelling'));
      try {
        const tx = await cancelOrder(orderId);
        if (!tx) {
          throw new Error(t('toast.cancelFailed'));
        }
        const receipt = await publicClient?.waitForTransactionReceipt({
          hash: tx,
        });
        if (receipt && receipt.status !== 'success') {
          throw new Error(t('toast.cancelFailed'));
        }
        toast.success(t('toast.cancelled', { id: orderId }), { id: toastId });
        await refresh();
        return true;
      } catch (error) {
        toast.error(getErrorMessage(error, t('toast.cancelFailed')), {
          id: toastId,
        });
        return false;
      } finally {
        setCancellingId(null);
      }
    },
    [cancelOrder, publicClient, refresh, t]
  );

  return {
    address,
    isConnected,
    now,
    loading,
    loadFailed,
    refreshing,
    orders,
    listings,
    buyRequests,
    myOrders,
    usdcBalanceWei,
    cctBalanceWei,
    paymentDecimals,
    filling,
    cancellingId,
    refresh,
    fill,
    cancel,
  };
};
