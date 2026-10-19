'use client';

import { RefreshCw, ShoppingCart, Wallet, Zap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAccount } from 'wagmi';
import { EmptyState } from '@/components/app/empty-state';
import { StatCard } from '@/components/app/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CONTRACTS } from '@/config/contracts';
import { useContractInteraction } from '@/hooks/use-contract-interaction';
import { usePaymentDecimals } from '@/hooks/use-payment-decimals';
import { formatCarbonTonnes, formatCurrency } from '@/lib/carb-format';
import {
  notifyTradeSuccess,
  requestNotificationPermission,
} from '@/lib/carb-notifications';
import { type TranslateFn, useT } from '@/lib/i18n';
import { getMarketplaceRevert } from '@/lib/marketplace-errors';
import {
  CCT_DECIMALS,
  formatAmountInput,
  orderCostCeil,
  parseAmountInput,
  toDisplayNumber,
} from '@/lib/token-units';
import type { Order } from '@/types/carb';
import { messages } from './_messages';

type RequestTab = 'request' | 'browse' | 'my-requests';

const PERCENT = 100;
const TX_HASH_PREVIEW_LENGTH = 10;
const WALLET_REJECTION_PATTERN = /rejected|cancelled|denied/;
const SUCCESS_TEXT = 'text-emerald-600 dark:text-emerald-400';

const getRequestStatus = (req: Order) => {
  if (req.amountWei === req.filledWei) {
    return { label: 'status.filled', className: SUCCESS_TEXT };
  }
  if (req.filledWei > 0n) {
    return {
      label: 'status.partial',
      className: 'text-amber-600 dark:text-amber-400',
    };
  }
  return {
    label: 'status.pending',
    className: 'text-orange-600 dark:text-orange-400',
  };
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error && typeof error === 'object') {
    const { shortMessage, message } = error as {
      shortMessage?: string;
      message?: string;
    };
    return shortMessage || message || fallback;
  }
  return fallback;
};

const getRevertMessage = (error: unknown, t: TranslateFn): string | null => {
  const revert = getMarketplaceRevert(error);
  if (revert === 'priceBelowMinimum') {
    return t('error.priceBelowMinimum');
  }
  if (revert === 'cannotFillOwnOrder') {
    return t('error.cannotFillOwnOrder');
  }
  return null;
};

const showSubmitError = (error: unknown, t: TranslateFn) => {
  const errorMessage =
    getRevertMessage(error, t) ??
    getErrorMessage(error, t('toast.submitFailed'));
  if (WALLET_REJECTION_PATTERN.test(errorMessage.toLowerCase())) {
    toast.error(t('toast.walletCancelled'));
  } else {
    toast.error(errorMessage);
  }
};

interface BalanceBarProps {
  usdcBalance: number | null;
  cctBalance: number | null;
  refreshing: boolean;
  onRefresh: () => void;
}

const BalanceBar = ({
  usdcBalance,
  cctBalance,
  refreshing,
  onRefresh,
}: BalanceBarProps) => {
  const t = useT(messages);
  return (
    <div className='flex flex-wrap items-center gap-4'>
      <div className='flex items-center gap-2 border border-dashed px-4 py-2.5'>
        <Wallet className='size-4 text-primary' />
        <span className='text-muted-foreground text-sm'>
          {t('balance.usdc')}
        </span>
        <span className='font-semibold text-lg'>
          {usdcBalance === null ? '—' : formatCurrency(usdcBalance)}
        </span>
      </div>
      <div className='flex items-center gap-2 border border-dashed px-4 py-2.5'>
        <Zap className='size-4 text-primary' />
        <span className='text-muted-foreground text-sm'>
          {t('balance.cct')}
        </span>
        <span className='font-semibold text-lg'>
          {cctBalance === null ? '—' : formatCarbonTonnes(cctBalance)}
        </span>
      </div>
      <Button
        aria-label={t('balance.refresh')}
        disabled={refreshing}
        onClick={onRefresh}
        size='icon'
        title={t('balance.refresh')}
        type='button'
        variant='outline'
      >
        <RefreshCw className={refreshing ? 'animate-spin' : ''} />
      </Button>
    </div>
  );
};

interface SellOrderCardProps {
  credit: Order;
  buyAmount: string | undefined;
  isOwnOrder: boolean;
  onAmountChange: (orderId: number, value: string) => void;
  onBuy: (credit: Order) => void;
}

const SellOrderCard = ({
  credit,
  buyAmount,
  isOwnOrder,
  onAmountChange,
  onBuy,
}: SellOrderCardProps) => {
  const t = useT(messages);
  const remainingWei = credit.amountWei - credit.filledWei;
  const remaining = toDisplayNumber(remainingWei, CCT_DECIMALS);
  const buyAmountWei = parseAmountInput(buyAmount ?? '', CCT_DECIMALS) ?? 0n;
  const totalCostDisplay = toDisplayNumber(
    orderCostCeil(buyAmountWei, credit.priceWei),
    credit.paymentDecimals
  );
  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardContent className='space-y-4'>
        <div className='flex items-start justify-between gap-2'>
          <div className='min-w-0'>
            <h3 className='font-semibold text-lg'>
              {t('sell.title', { id: credit.orderId })}
            </h3>
            <p className='break-all text-muted-foreground text-sm'>
              {t('sell.seller', { address: credit.trader })}
            </p>
          </div>
          <Badge variant='outline'>{t('sell.fixedPrice')}</Badge>
        </div>

        <div className='grid grid-cols-2 gap-4 text-sm'>
          <div>
            <p className='text-muted-foreground'>{t('sell.amountAvailable')}</p>
            <p className='font-bold text-lg'>{remaining.toFixed(2)}</p>
            <p className='text-muted-foreground text-xs'>
              {t('sell.tonnesCo2')}
            </p>
            {credit.filled > 0 && (
              <p className='mt-1 text-muted-foreground text-xs'>
                {t('sell.filledNote', { amount: credit.filled.toFixed(1) })}
              </p>
            )}
          </div>
          <div>
            <p className='text-muted-foreground'>{t('sell.price')}</p>
            <p className='font-bold text-lg'>${credit.pricePerTonne}</p>
            <p className='text-muted-foreground text-xs'>
              {t('sell.perTonne')}
            </p>
          </div>
        </div>

        <div className='space-y-3 border-t border-dashed pt-4'>
          <div className='flex items-center gap-2'>
            <Input
              aria-label={t('sell.amountAria', { id: credit.orderId })}
              className='flex-1'
              max={remaining}
              min='0.01'
              onChange={(e) => onAmountChange(credit.orderId, e.target.value)}
              placeholder={t('sell.amountPlaceholder')}
              step='0.01'
              type='number'
              value={buyAmount || ''}
            />
            <span className='text-muted-foreground text-sm'>
              {t('sell.unit')}
            </span>
          </div>
          <Button
            className='w-full'
            disabled={isOwnOrder}
            onClick={() => onBuy(credit)}
            type='button'
          >
            {isOwnOrder ? t('sell.yourOrder') : t('sell.buyNow')}
          </Button>
        </div>

        <p className='text-center text-muted-foreground text-xs'>
          {t('sell.totalCost', {
            amount: `$${totalCostDisplay.toFixed(2)}`,
          })}
        </p>
      </CardContent>
    </Card>
  );
};

interface BrowseTabProps {
  credits: Order[];
  buyAmounts: Record<number, string>;
  connectedAddress: string | undefined;
  onAmountChange: (orderId: number, value: string) => void;
  onBuy: (credit: Order) => void;
}

const BrowseTab = ({
  credits,
  buyAmounts,
  connectedAddress,
  onAmountChange,
  onBuy,
}: BrowseTabProps) => {
  const t = useT(messages);
  if (credits.length === 0) {
    return (
      <EmptyState
        description={t('browse.emptyDescription')}
        icon={<ShoppingCart className='size-12' />}
        title={t('browse.emptyTitle')}
      />
    );
  }
  return (
    <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
      {credits.map((credit) => (
        <SellOrderCard
          buyAmount={buyAmounts[credit.orderId]}
          credit={credit}
          isOwnOrder={
            connectedAddress?.toLowerCase() === credit.trader.toLowerCase()
          }
          key={credit.orderId}
          onAmountChange={onAmountChange}
          onBuy={onBuy}
        />
      ))}
    </div>
  );
};

const RequestCard = ({ request: req }: { request: Order }) => {
  const t = useT(messages);
  const status = getRequestStatus(req);
  const remaining = req.amount - req.filled;
  const progress = (req.filled / req.amount) * PERCENT;
  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardContent className='space-y-4'>
        <div className='flex items-start justify-between gap-2'>
          <div className='min-w-0'>
            <h3 className='font-semibold text-lg'>
              {t('request.title', { id: req.orderId })}
            </h3>
            <p className='break-all text-muted-foreground text-sm'>
              {t('request.by', { address: req.trader })}
            </p>
          </div>
          <Badge className={status.className} variant='outline'>
            {t(status.label)}
          </Badge>
        </div>

        <div className='grid grid-cols-2 gap-4 text-sm md:grid-cols-4'>
          <div>
            <p className='text-muted-foreground'>{t('request.totalAmount')}</p>
            <p className='font-bold'>{req.amount}</p>
          </div>
          <div>
            <p className='text-muted-foreground'>{t('request.filled')}</p>
            <p className={`font-bold ${SUCCESS_TEXT}`}>{req.filled}</p>
          </div>
          <div>
            <p className='text-muted-foreground'>{t('request.remaining')}</p>
            <p className='font-bold text-orange-600 dark:text-orange-400'>
              {remaining}
            </p>
          </div>
          <div>
            <p className='text-muted-foreground'>{t('request.maxPrice')}</p>
            <p className='font-bold'>${req.pricePerTonne}</p>
          </div>
        </div>

        <div>
          <div className='mb-1 flex justify-between text-muted-foreground text-xs'>
            <span>{t('request.progress')}</span>
            <span>{progress.toFixed(0)}%</span>
          </div>
          <div className='h-2 w-full bg-muted'>
            <div
              className='h-2 bg-primary transition-all'
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {remaining > 0 && (
          <Button className='w-full' size='sm' type='button'>
            {t('request.openForSellers', { amount: remaining })}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

interface MyRequestsTabProps {
  requests: Order[];
  onSubmitRequest: () => void;
}

const MyRequestsTab = ({ requests, onSubmitRequest }: MyRequestsTabProps) => {
  const t = useT(messages);
  if (requests.length === 0) {
    return (
      <EmptyState
        action={
          <Button onClick={onSubmitRequest} type='button'>
            {t('myRequests.submit')}
          </Button>
        }
        description={t('myRequests.emptyDescription')}
        icon={<ShoppingCart className='size-12' />}
        title={t('myRequests.emptyTitle')}
      />
    );
  }
  return (
    <div className='space-y-4'>
      {requests.map((req) => (
        <RequestCard key={req.orderId} request={req} />
      ))}
    </div>
  );
};

interface RequestFormData {
  creditAmount: string;
  maxPricePerTonne: string;
  deadline: string;
}

interface RequestFormProps {
  formData: RequestFormData;
  estimatedCost: number;
  isSubmitting: boolean;
  minPriceError: string | null;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
}

const RequestForm = ({
  formData,
  estimatedCost,
  isSubmitting,
  minPriceError,
  onChange,
  onSubmit,
}: RequestFormProps) => {
  const t = useT(messages);
  return (
    <Card className='max-w-2xl rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle className='text-xl'>{t('form.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className='space-y-6' onSubmit={onSubmit}>
          <div className='space-y-2'>
            <Label htmlFor='creditAmount'>{t('form.creditAmount')}</Label>
            <Input
              disabled={isSubmitting}
              id='creditAmount'
              name='creditAmount'
              onChange={onChange}
              placeholder={t('form.creditAmountPlaceholder')}
              type='number'
              value={formData.creditAmount}
            />
          </div>

          <div className='space-y-2'>
            <Label htmlFor='maxPricePerTonne'>{t('form.maxPrice')}</Label>
            <Input
              disabled={isSubmitting}
              id='maxPricePerTonne'
              name='maxPricePerTonne'
              onChange={onChange}
              placeholder={t('form.maxPricePlaceholder')}
              step='0.01'
              type='number'
              value={formData.maxPricePerTonne}
            />
          </div>

          {minPriceError && (
            <p className='text-destructive text-sm' role='alert'>
              {minPriceError}
            </p>
          )}

          {formData.creditAmount && formData.maxPricePerTonne && (
            <div className='border border-dashed p-4'>
              <p className='text-muted-foreground text-sm'>
                {t('form.estimatedCost')}
              </p>
              <p className='font-bold text-lg'>
                {t('form.estimatedMax', {
                  amount: `$${estimatedCost.toFixed(2)}`,
                })}
              </p>
            </div>
          )}

          <Button
            className='w-full'
            disabled={isSubmitting || minPriceError !== null}
            type='submit'
          >
            {isSubmitting ? t('form.submitting') : t('form.submit')}
          </Button>

          <p className='text-center text-muted-foreground text-xs'>
            {t('form.hint')}
          </p>
        </form>
      </CardContent>
    </Card>
  );
};

const CreditRequestsPage = () => {
  const t = useT(messages);
  const { address, isConnected } = useAccount();
  const {
    createBuyOrder,
    fillOrder,
    getMarketplaceOrders,
    getErc20Balance,
    ensureErc20Allowance,
    publicClient,
    getMinPricePerTonne,
  } = useContractInteraction();
  const { decimals: paymentDecimals } = usePaymentDecimals();

  const [tab, setTab] = useState<RequestTab>('browse');
  const [formData, setFormData] = useState({
    creditAmount: '',
    maxPricePerTonne: '',
    deadline: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestedCredits, setRequestedCredits] = useState<Order[]>([]);
  const [availableCredits, setAvailableCredits] = useState<Order[]>([]);
  const [buyAmounts, setBuyAmounts] = useState<Record<number, string>>({});
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [cctBalance, setCctBalance] = useState<number | null>(null);
  const [balanceRefreshing, setBalanceRefreshing] = useState(false);
  const [minPriceWei, setMinPriceWei] = useState<bigint | null>(null);

  const loadBalances = useCallback(async () => {
    if (!(isConnected && address)) {
      return;
    }
    setBalanceRefreshing(true);
    try {
      const [usdc, cct] = await Promise.all([
        getErc20Balance(CONTRACTS.usdc, address).catch(() => 0),
        getErc20Balance(CONTRACTS.carbonCreditToken, address).catch(() => 0),
      ]);
      setUsdcBalance(usdc);
      setCctBalance(cct);
    } catch {
      // balances stay at their previous value
    } finally {
      setBalanceRefreshing(false);
    }
  }, [isConnected, address, getErc20Balance]);

  const loadOrders = useCallback(async () => {
    try {
      const orders = (await getMarketplaceOrders()) || [];
      const sellOrders = orders.filter(
        (order) =>
          !order.isBuyOrder &&
          order.isActive &&
          order.amountWei > order.filledWei
      );
      const buyOrders = orders.filter(
        (order) => order.isBuyOrder && order.isActive
      );

      setAvailableCredits(sellOrders);
      setRequestedCredits(
        buyOrders.filter(
          (order) => order.trader.toLowerCase() === address?.toLowerCase()
        )
      );

      const amounts: Record<number, string> = {};
      for (const order of sellOrders) {
        amounts[order.orderId] = formatAmountInput(
          order.amountWei - order.filledWei,
          CCT_DECIMALS
        );
      }
      setBuyAmounts(amounts);
    } catch {
      // orders stay at their previous value
    }
  }, [getMarketplaceOrders, address]);

  useEffect(() => {
    if (!(isConnected && address)) {
      return;
    }
    requestNotificationPermission();
    loadOrders();
    loadBalances();
  }, [isConnected, address, loadOrders, loadBalances]);

  useEffect(() => {
    let cancelled = false;
    getMinPricePerTonne().then((value) => {
      if (!cancelled) {
        setMinPriceWei(value);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [getMinPricePerTonne]);

  const enteredPriceWei =
    paymentDecimals === undefined
      ? null
      : parseAmountInput(formData.maxPricePerTonne, paymentDecimals);
  const minPriceError =
    minPriceWei !== null &&
    paymentDecimals !== undefined &&
    enteredPriceWei !== null &&
    enteredPriceWei < minPriceWei
      ? t('validation.minPrice', {
          min: `$${formatAmountInput(minPriceWei, paymentDecimals)}`,
        })
      : null;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  /** Resolves false when the USDG approval did not go through. */
  const approveForRequest = async (
    totalCostWei: bigint,
    decimals: number,
    loadingToast: string | number
  ): Promise<boolean> => {
    let approveToast: string | number | undefined;
    const ok = await ensureErc20Allowance(CONTRACTS.usdc, totalCostWei, () => {
      toast.dismiss(loadingToast);
      approveToast = toast.loading(
        t('toast.approving', {
          amount: formatAmountInput(totalCostWei, decimals),
        })
      );
    });
    if (approveToast !== undefined) {
      toast.dismiss(approveToast);
    }
    if (!ok) {
      toast.error(t('toast.approvalFailed'));
      return false;
    }
    if (approveToast !== undefined) {
      toast.success(t('toast.approvedCreating'));
    }
    return true;
  };

  /** Validates the request form; toasts and returns null when it is not submittable. */
  const parseRequestInputs = () => {
    if (!(formData.creditAmount && formData.maxPricePerTonne)) {
      toast.error(t('toast.fillAllFields'));
      return null;
    }
    if (minPriceError) {
      toast.error(minPriceError);
      return null;
    }
    if (paymentDecimals === undefined) {
      toast.error(t('toast.decimalsUnavailable'));
      return null;
    }
    const amountWei = parseAmountInput(formData.creditAmount, CCT_DECIMALS);
    const priceWei = parseAmountInput(
      formData.maxPricePerTonne,
      paymentDecimals
    );
    if (amountWei === null || priceWei === null) {
      toast.error(t('toast.fillAllFields'));
      return null;
    }
    return { amountWei, priceWei, decimals: paymentDecimals };
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();

    const inputs = parseRequestInputs();
    if (!inputs) {
      return;
    }
    const { amountWei, priceWei, decimals } = inputs;

    setIsSubmitting(true);
    const loadingToast = toast.loading(t('toast.checkingApproval'));

    try {
      const totalCostWei = orderCostCeil(amountWei, priceWei);

      const approved = await approveForRequest(
        totalCostWei,
        decimals,
        loadingToast
      );
      if (!approved) {
        return;
      }

      const orderToast = toast.loading(t('toast.creatingOrder'));
      const txHash = await createBuyOrder(
        formData.creditAmount,
        formData.maxPricePerTonne,
        0,
        false
      );

      toast.dismiss(orderToast);

      if (!txHash) {
        throw new Error(t('toast.orderCancelled'));
      }
      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
        });
        if (receipt.status !== 'success') {
          throw new Error(t('toast.orderReverted'));
        }
      }
      toast.success(
        t('toast.orderCreated', {
          hash: txHash.slice(0, TX_HASH_PREVIEW_LENGTH),
        })
      );
      notifyTradeSuccess(
        'buy',
        toDisplayNumber(amountWei, CCT_DECIMALS),
        toDisplayNumber(priceWei, decimals),
        txHash
      );

      setFormData({ creditAmount: '', maxPricePerTonne: '', deadline: '' });
      setTab('my-requests');
      await Promise.all([loadOrders(), loadBalances()]);
    } catch (error) {
      toast.dismiss(loadingToast);
      showSubmitError(error, t);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBuyCredit = async (credit: Order) => {
    if (!isConnected) {
      toast.error(t('toast.connectWallet'));
      return;
    }

    const remainingWei = credit.amountWei - credit.filledWei;
    const amountWei = parseAmountInput(
      buyAmounts[credit.orderId] || '',
      CCT_DECIMALS
    );
    if (amountWei === null || amountWei > remainingWei) {
      toast.error(
        t('toast.invalidAmount', {
          max: formatAmountInput(remainingWei, CCT_DECIMALS),
        })
      );
      return;
    }

    const confirmToast = toast.loading(t('toast.processing'));

    try {
      // Exact bigint cost (rounded up); the allowance is re-read before approving.
      const totalCostWei = orderCostCeil(amountWei, credit.priceWei);
      const approved = await ensureErc20Allowance(
        CONTRACTS.usdc,
        totalCostWei,
        () => {
          toast.dismiss(confirmToast);
          toast.loading(t('toast.approvingShort'));
        }
      );
      if (!approved) {
        throw new Error(t('toast.approvalFailed'));
      }

      toast.loading(t('toast.filling'));
      const txHash = await fillOrder(credit.orderId, amountWei);
      if (!txHash) {
        throw new Error(t('toast.fillFailed'));
      }

      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
        });
        if (receipt.status !== 'success') {
          throw new Error(t('toast.fillFailed'));
        }
      }

      const amount = formatAmountInput(amountWei, CCT_DECIMALS);
      toast.dismiss();
      toast.success(t('toast.purchased', { amount }));
      notifyTradeSuccess(
        'buy',
        toDisplayNumber(amountWei, CCT_DECIMALS),
        credit.pricePerTonne,
        txHash
      );
      await Promise.all([loadOrders(), loadBalances()]);
    } catch (error) {
      toast.dismiss();
      toast.error(
        getRevertMessage(error, t) ??
          getErrorMessage(error, t('toast.purchaseFailed'))
      );
    }
  };

  if (!isConnected) {
    return (
      <div className='space-y-6'>
        <div>
          <h1 className='font-semibold text-2xl tracking-tight'>
            {t('page.title')}
          </h1>
          <p className='text-muted-foreground'>{t('page.subtitle')}</p>
        </div>
        <EmptyState
          description={t('page.connectDescription')}
          icon={<ShoppingCart className='size-12' />}
          title={t('page.connectTitle')}
        />
      </div>
    );
  }

  const totalRequests = requestedCredits.reduce(
    (sum, req) => sum + req.amount,
    0
  );
  const filledRequests = requestedCredits.reduce(
    (sum, req) => sum + req.filled,
    0
  );
  const pendingAmount = requestedCredits.reduce(
    (sum, req) => sum + (req.amount - req.filled),
    0
  );
  const availableTonnes = availableCredits.reduce(
    (sum, c) => sum + (c.amount - c.filled),
    0
  );
  const estimatedCostWei =
    paymentDecimals === undefined
      ? null
      : orderCostCeil(
          parseAmountInput(formData.creditAmount, CCT_DECIMALS) ?? 0n,
          parseAmountInput(formData.maxPricePerTonne, paymentDecimals) ?? 0n
        );
  const estimatedCost =
    estimatedCostWei === null || paymentDecimals === undefined
      ? 0
      : toDisplayNumber(estimatedCostWei, paymentDecimals);

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='font-semibold text-2xl tracking-tight'>
          {t('page.title')}
        </h1>
        <p className='text-muted-foreground'>{t('page.subtitle')}</p>
      </div>

      <BalanceBar
        cctBalance={cctBalance}
        onRefresh={loadBalances}
        refreshing={balanceRefreshing}
        usdcBalance={usdcBalance}
      />

      <div className='grid grid-cols-1 gap-4 md:grid-cols-4'>
        <StatCard
          label={t('stats.totalRequested')}
          subtext={t('stats.tonnes')}
          value={totalRequests.toFixed(0)}
        />
        <StatCard
          label={t('stats.alreadyFilled')}
          subtext={t('stats.tonnes')}
          value={filledRequests.toFixed(0)}
        />
        <StatCard
          label={t('stats.stillPending')}
          subtext={t('stats.tonnes')}
          value={pendingAmount.toFixed(0)}
        />
        <StatCard
          label={t('stats.availableCredits')}
          subtext={t('stats.tonnes')}
          value={availableTonnes.toFixed(0)}
        />
      </div>

      <Tabs onValueChange={(v) => setTab(v as RequestTab)} value={tab}>
        <TabsList>
          <TabsTrigger value='browse'>{t('tabs.browse')}</TabsTrigger>
          <TabsTrigger value='my-requests'>{t('tabs.myRequests')}</TabsTrigger>
          <TabsTrigger value='request'>{t('tabs.submit')}</TabsTrigger>
        </TabsList>

        <TabsContent className='mt-4' value='browse'>
          <BrowseTab
            buyAmounts={buyAmounts}
            connectedAddress={address}
            credits={availableCredits}
            onAmountChange={(orderId, value) =>
              setBuyAmounts((prev) => ({ ...prev, [orderId]: value }))
            }
            onBuy={handleBuyCredit}
          />
        </TabsContent>

        <TabsContent className='mt-4' value='my-requests'>
          <MyRequestsTab
            onSubmitRequest={() => setTab('request')}
            requests={requestedCredits}
          />
        </TabsContent>

        <TabsContent className='mt-4' value='request'>
          <RequestForm
            estimatedCost={estimatedCost}
            formData={formData}
            isSubmitting={isSubmitting}
            minPriceError={minPriceError}
            onChange={handleInputChange}
            onSubmit={handleSubmitRequest}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CreditRequestsPage;
