'use client';

import type { ChangeEvent, FormEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAccount } from 'wagmi';
import { EmptyState } from '@/components/app/empty-state';
import { FeeTierNote } from '@/components/app/fee-tier-note';
import { StatCard } from '@/components/app/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CCT_POOLS } from '@/config/cct-pools';
import { CONTRACTS } from '@/config/contracts';
import { useContractInteraction } from '@/hooks/use-contract-interaction';
import { usePaymentDecimals } from '@/hooks/use-payment-decimals';
import { fetchDepositoryCredits } from '@/lib/carb-api';
import { requestNotificationPermission } from '@/lib/carb-notifications';
import { type TranslateFn, useT } from '@/lib/i18n';
import { getMarketplaceRevert } from '@/lib/marketplace-errors';
import {
  CCT_DECIMALS,
  formatAmountInput,
  orderCostCeil,
  orderCostFloor,
  parseAmountInput,
} from '@/lib/token-units';
import { getWrapBlocker } from '@/lib/wrap-eligibility';
import type { CarbonCredit } from '@/types/carb';
import { messages } from './_messages';

type SaleType = 'fixed-price' | 'auction';
type SellTab = 'list' | 'active';

interface ListingForm {
  amount: string;
  pricePerTonne: string;
  saleType: SaleType;
  auctionEndTime: string;
  auctionStartPrice: string;
}

interface ActiveListing {
  id: string;
  amount: number;
  pricePerTonne: number;
  saleType: SaleType;
  listedAt: number;
  status: 'active' | 'pending' | 'sold';
  totalValue: number;
}

const EMPTY_FORM: ListingForm = {
  amount: '',
  pricePerTonne: '',
  saleType: 'fixed-price',
  auctionEndTime: '',
  auctionStartPrice: '',
};

const SALE_TYPES: { value: SaleType; labelKey: string }[] = [
  { value: 'fixed-price', labelKey: 'saleType.fixed-price' },
  { value: 'auction', labelKey: 'saleType.auction' },
];

const MAX_WRAP_SUGGESTIONS = 5;
const MS_PER_HOUR = 60 * 60 * 1000;
const WALLET_REJECTION_PATTERN = /user rejected|rejected|cancelled|denied/;

const getErrorMessage = (
  error: unknown,
  fallback: string,
  t: TranslateFn
): string => {
  if (getMarketplaceRevert(error) === 'priceBelowMinimum') {
    return t('error.priceBelowMinimum');
  }
  const err = error as { shortMessage?: string; message?: string } | null;
  const message = String(err?.shortMessage || err?.message || fallback);
  return WALLET_REJECTION_PATTERN.test(message.toLowerCase())
    ? t('error.walletCancelled')
    : message;
};

const TONNE_SCALE = 10n ** 18n;

/**
 * Effective price per tonne in payment-token base units, parsed exactly
 * (auction: total starting bid * 1e18 / tonnes, like the contract).
 */
const getEnteredPriceWei = (
  form: ListingForm,
  paymentDecimals: number | undefined
): bigint | null => {
  if (paymentDecimals === undefined) {
    return null;
  }
  if (form.saleType === 'fixed-price') {
    return parseAmountInput(form.pricePerTonne, paymentDecimals);
  }
  const startBid = parseAmountInput(form.auctionStartPrice, paymentDecimals);
  const amount = parseAmountInput(form.amount, CCT_DECIMALS);
  return startBid !== null && amount !== null
    ? (startBid * TONNE_SCALE) / amount
    : null;
};

const getMinPriceError = (
  form: ListingForm,
  minPriceWei: bigint | null,
  paymentDecimals: number | undefined,
  t: TranslateFn
): string | null => {
  const entered = getEnteredPriceWei(form, paymentDecimals);
  if (
    minPriceWei === null ||
    paymentDecimals === undefined ||
    entered === null ||
    entered >= minPriceWei
  ) {
    return null;
  }
  const min = formatAmountInput(minPriceWei, paymentDecimals);
  if (form.saleType === 'fixed-price') {
    return t('validation.minPrice', { min });
  }
  const amountWei = parseAmountInput(form.amount, CCT_DECIMALS) ?? 0n;
  const total = formatAmountInput(
    orderCostCeil(amountWei, minPriceWei),
    paymentDecimals
  );
  return t('validation.minAuction', { min, total });
};

// CarbonMarketplace: endTime is an absolute timestamp between now + 1 hour and now + 30 days.
const MIN_AUCTION_SECONDS = 60 * 60;
const MAX_AUCTION_SECONDS = 30 * 24 * 60 * 60;
/** Safety margin so the transaction still passes the onchain bounds after mining delay. */
const AUCTION_BOUND_MARGIN_SECONDS = 5 * 60;

const isAuctionEndTimeAllowed = (value: string): boolean => {
  const end = new Date(value).getTime() / 1000;
  const now = Date.now() / 1000;
  return (
    Number.isFinite(end) &&
    end >= now + MIN_AUCTION_SECONDS + AUCTION_BOUND_MARGIN_SECONDS &&
    end <= now + MAX_AUCTION_SECONDS - AUCTION_BOUND_MARGIN_SECONDS
  );
};

const getListingValidationError = (
  form: ListingForm,
  minPriceWei: bigint | null,
  paymentDecimals: number | undefined,
  t: TranslateFn
): string | null => {
  if (paymentDecimals === undefined) {
    return t('toast.decimalsUnavailable');
  }
  if (!(form.amount && parseAmountInput(form.amount, CCT_DECIMALS))) {
    return t('validation.amount');
  }
  if (
    form.saleType === 'fixed-price' &&
    !parseAmountInput(form.pricePerTonne, paymentDecimals)
  ) {
    return t('validation.price');
  }
  if (
    form.saleType === 'auction' &&
    !(
      form.auctionEndTime &&
      parseAmountInput(form.auctionStartPrice, paymentDecimals)
    )
  ) {
    return t('validation.auction');
  }
  if (
    form.saleType === 'auction' &&
    !isAuctionEndTimeAllowed(form.auctionEndTime)
  ) {
    return t('validation.auctionDuration');
  }
  return getMinPriceError(form, minPriceWei, paymentDecimals, t);
};

interface ReceiptClient {
  waitForTransactionReceipt(args: {
    hash: `0x${string}`;
  }): Promise<{ status: string }>;
}

const assertTxSucceeded = async (
  client: ReceiptClient | null | undefined,
  hash: `0x${string}`,
  revertMessage: string
) => {
  if (!client) {
    return;
  }
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') {
    throw new Error(revertMessage);
  }
};
type ListingTxHash = `0x${string}` | null | undefined;

const submitListingTx = (
  form: ListingForm,
  createSellOrder: (amount: string, price: string) => Promise<ListingTxHash>,
  createAuction: (
    amount: string,
    startPrice: string,
    endTime: number
  ) => Promise<ListingTxHash>
): Promise<ListingTxHash> => {
  if (form.saleType === 'fixed-price') {
    return createSellOrder(form.amount, form.pricePerTonne);
  }
  const endTime = Math.floor(new Date(form.auctionEndTime).getTime() / 1000);
  return createAuction(form.amount, form.auctionStartPrice, endTime);
};

const SellCredits = () => {
  const t = useT(messages);
  const { address, isConnected } = useAccount();
  const {
    getUserCredits,
    getMarketplaceOrders,
    getActiveAuctions,
    getErc20Balance,
    getErc20BalanceWei,
    ensureErc20Allowance,
    approveNftForAll,
    wrapCredit,
    createSellOrder,
    getMinPricePerTonne,
    createAuction,
    cancelOrder,
    cancelAuction,
    publicClient,
  } = useContractInteraction();

  const tRef = useRef(t);
  tRef.current = t;

  const [tab, setTab] = useState<SellTab>('list');
  const [userCredits, setUserCredits] = useState<CarbonCredit[]>([]);
  const [activeListings, setActiveListings] = useState<ActiveListing[]>([]);
  const [cctBalance, setCctBalance] = useState(0);
  const [unwrappedEquivalent, setUnwrappedEquivalent] = useState(0);
  const [usdcBalance, setUsdcBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [wrappingTokenId, setWrappingTokenId] = useState<number | null>(null);
  const [formData, setFormData] = useState<ListingForm>(EMPTY_FORM);
  const [minPriceWei, setMinPriceWei] = useState<bigint | null>(null);
  const { decimals: paymentDecimals } = usePaymentDecimals();

  const refreshSellData = useCallback(async () => {
    if (!(isConnected && address)) {
      setLoading(false);
      return;
    }

    try {
      const [rawCredits, depositoryRes] = await Promise.all([
        getUserCredits(address),
        fetchDepositoryCredits(address, false).catch(() => null),
      ]);
      const credits = rawCredits || [];
      setUserCredits(credits);

      const nftCreditTonnes = credits
        .filter((credit) => !credit?.isRetired)
        .reduce((sum, credit) => sum + Number(credit?.co2Tonnes || 0), 0);
      const depositoryTonnes = (depositoryRes?.credits || [])
        .filter((credit) => credit?.status === 'Active')
        .reduce((sum, credit) => sum + Number(credit?.co2Amount || 0), 0);
      const walletCreditEquivalent =
        nftCreditTonnes > 0 ? nftCreditTonnes : depositoryTonnes;

      const balance = await getErc20Balance(
        CONTRACTS.carbonCreditToken,
        address
      );
      setCctBalance(Number(balance || 0));
      setUnwrappedEquivalent(walletCreditEquivalent);

      const usdc = await getErc20Balance(CONTRACTS.usdc, address);
      setUsdcBalance(Number(usdc || 0));

      const orders = await getMarketplaceOrders();
      const auctions = await getActiveAuctions();

      const activeOrders = (orders || [])
        .filter(
          (order) =>
            !order.isBuyOrder &&
            order.trader.toLowerCase() === address.toLowerCase()
        )
        .map((order) => {
          const remaining = Math.max(order.amount - order.filled, 0);
          let status: ActiveListing['status'] = 'pending';
          if (order.isActive) {
            status = 'active';
          } else if (order.filledWei >= order.amountWei) {
            status = 'sold';
          }
          return {
            id: order.orderId.toString(),
            amount: remaining,
            pricePerTonne: order.pricePerTonne,
            saleType: 'fixed-price' as const,
            listedAt: order.createdAt * 1000,
            status,
            totalValue: remaining * order.pricePerTonne,
          };
        });

      const activeAuctionListings = (auctions || [])
        .filter(
          (auction) => auction.seller.toLowerCase() === address.toLowerCase()
        )
        .map((auction) => ({
          id: auction.auctionId.toString(),
          amount: auction.amount,
          pricePerTonne: auction.startPrice,
          saleType: 'auction' as const,
          listedAt: auction.startTime * 1000,
          status: (auction.isActive ? 'active' : 'pending') as
            | 'active'
            | 'pending',
          totalValue: auction.amount * auction.startPrice,
        }));

      setActiveListings([...activeOrders, ...activeAuctionListings]);
    } catch {
      toast.error(tRef.current('toast.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [
    isConnected,
    address,
    getUserCredits,
    getMarketplaceOrders,
    getActiveAuctions,
    getErc20Balance,
  ]);

  useEffect(() => {
    requestNotificationPermission();
    setLoading(true);
    refreshSellData();
  }, [refreshSellData]);

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

  const handleWrapCredit = async (tokenId: number) => {
    if (!address) {
      return;
    }

    setWrappingTokenId(tokenId);
    const loadingToast = toast.loading(t('toast.wrapping', { id: tokenId }));

    try {
      const approvalTx = await approveNftForAll(
        CONTRACTS.carbonCreditNFT,
        CONTRACTS.carbonCreditToken,
        true
      );
      if (!approvalTx) {
        throw new Error(t('toast.nftApprovalFailed'));
      }
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: approvalTx });
      }

      const wrapTx = await wrapCredit(tokenId);
      if (!wrapTx) {
        throw new Error(t('toast.wrapTxFailed'));
      }
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: wrapTx });
      }

      toast.dismiss(loadingToast);
      toast.success(t('toast.wrapped', { id: tokenId }));
      await refreshSellData();
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error((error as Error)?.message || t('toast.wrapFailed'));
    } finally {
      setWrappingTokenId(null);
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmitListing = async (e: FormEvent) => {
    e.preventDefault();

    const validationError = getListingValidationError(
      formData,
      minPriceWei,
      paymentDecimals,
      t
    );
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setIsSubmitting(true);
    const loadingToast = toast.loading(t('toast.creating'));

    try {
      const amountWei = parseAmountInput(formData.amount, CCT_DECIMALS);
      if (amountWei === null) {
        throw new Error(t('validation.amount'));
      }

      const balanceWei = await getErc20BalanceWei(
        CONTRACTS.carbonCreditToken,
        address as string
      );
      if (balanceWei === null || amountWei > balanceWei) {
        throw new Error(
          t('toast.insufficient', { balance: cctBalance.toFixed(2) })
        );
      }

      // Exact approval of the CCT being listed; allowance is re-read first.
      let approvalSent = false;
      const approved = await ensureErc20Allowance(
        CONTRACTS.carbonCreditToken,
        amountWei,
        () => {
          approvalSent = true;
        }
      );
      if (!approved) {
        throw new Error(t('toast.cctApprovalFailed'));
      }
      if (approvalSent) {
        toast.success(t('toast.cctApproved'));
      }

      const txHash = await submitListingTx(
        formData,
        createSellOrder,
        createAuction
      );

      if (!txHash) {
        throw new Error(t('toast.listingFailedTx'));
      }
      await assertTxSucceeded(publicClient, txHash, t('tx.listingReverted'));

      toast.dismiss(loadingToast);
      toast.success(t('toast.created'));

      await refreshSellData();
      setFormData(EMPTY_FORM);
      setTab('active');
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error(getErrorMessage(error, t('toast.createFailed'), t));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelListing = async (listingId: string, saleType: SaleType) => {
    const loadingToast = toast.loading(t('toast.canceling'));
    try {
      const parsedId = Number(listingId);
      if (!Number.isFinite(parsedId)) {
        throw new Error(t('toast.invalidId'));
      }

      const txHash =
        saleType === 'fixed-price'
          ? await cancelOrder(parsedId)
          : await cancelAuction(parsedId);

      if (!txHash) {
        throw new Error(t('toast.cancelTxFailed'));
      }

      if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
        });
        if (receipt.status !== 'success') {
          throw new Error(t('toast.cancelReverted'));
        }
      }

      toast.dismiss(loadingToast);
      toast.success(t('toast.canceled'));
      await refreshSellData();
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error(getErrorMessage(error, t('toast.cancelFailed'), t));
    }
  };

  const minPriceError = getMinPriceError(
    formData,
    minPriceWei,
    paymentDecimals,
    t
  );
  const revenueWei =
    paymentDecimals === undefined
      ? null
      : orderCostFloor(
          parseAmountInput(formData.amount, CCT_DECIMALS) ?? 0n,
          parseAmountInput(formData.pricePerTonne, paymentDecimals) ?? 0n
        );
  const revenuePreview =
    revenueWei === null || paymentDecimals === undefined
      ? ''
      : formatAmountInput(revenueWei, paymentDecimals);
  const totalValue = activeListings.reduce((sum, l) => sum + l.totalValue, 0);
  const totalListedAmount = activeListings.reduce(
    (sum, l) => sum + l.amount,
    0
  );
  const wrappableCredits = userCredits.filter((credit) => !credit?.isRetired);

  if (!isConnected) {
    return (
      <Card className='rounded-none border-dashed shadow-none'>
        <CardContent>
          <EmptyState
            description={t('empty.connectDescription')}
            title={t('empty.connectTitle')}
          />
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <div className='space-y-6'>
        <Skeleton className='h-16 w-72 rounded-none' />
        <div className='grid grid-cols-1 gap-4 md:grid-cols-4'>
          {['a', 'b', 'c', 'd'].map((key) => (
            <Skeleton className='h-28 rounded-none' key={key} />
          ))}
        </div>
        <Skeleton className='h-64 rounded-none' />
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='font-semibold text-2xl tracking-tight'>
          {t('page.title')}
        </h1>
        <p className='text-muted-foreground'>{t('page.description')}</p>
      </div>

      <div className='grid grid-cols-1 gap-4 md:grid-cols-4'>
        <StatCard
          label={t('stat.nftCredits')}
          subtext={t('stat.available')}
          value={userCredits.length.toString()}
        />
        <StatCard
          label={t('stat.cctBalance')}
          subtext={t('stat.onChainTonnes')}
          value={cctBalance.toFixed(2)}
        />
        <StatCard
          label={t('stat.needWrapping')}
          subtext={t('stat.walletTonnes')}
          value={Math.max(unwrappedEquivalent - cctBalance, 0).toFixed(2)}
        />
        <StatCard
          label={t('stat.activeListings')}
          subtext={t('stat.listings')}
          value={activeListings
            .filter((listing) => listing.status === 'active')
            .length.toString()}
        />
        <StatCard
          label={t('stat.totalValue')}
          subtext={t('stat.usd')}
          value={`$${totalValue.toFixed(0)}`}
        />
        <StatCard
          label={t('stat.avgPrice')}
          subtext={t('stat.perTonne')}
          value={
            totalListedAmount > 0
              ? `$${(totalValue / totalListedAmount).toFixed(2)}`
              : '$0'
          }
        />
        <StatCard
          label={t('stat.usdcBalance')}
          subtext={t('stat.sellerProceeds')}
          value={`$${usdcBalance.toFixed(2)}`}
        />
      </div>

      <FeeTierNote />

      <Tabs onValueChange={(value) => setTab(value as SellTab)} value={tab}>
        <TabsList>
          <TabsTrigger value='list'>{t('tab.list')}</TabsTrigger>
          <TabsTrigger value='active'>{t('tab.active')}</TabsTrigger>
        </TabsList>

        <TabsContent className='mt-4' value='list'>
          <Card className='rounded-none border-dashed shadow-none'>
            <CardContent>
              {cctBalance > 0 ? (
                <form
                  className='max-w-xl space-y-6'
                  onSubmit={handleSubmitListing}
                >
                  <div className='space-y-2'>
                    <Label htmlFor='amount'>{t('form.amount')}</Label>
                    <Input
                      disabled={isSubmitting}
                      id='amount'
                      name='amount'
                      onChange={handleInputChange}
                      placeholder={t('form.amountPlaceholder')}
                      type='number'
                      value={formData.amount}
                    />
                  </div>

                  <fieldset className='space-y-2'>
                    <legend className='font-medium text-sm'>
                      {t('form.saleType')}
                    </legend>
                    <div className='flex gap-4'>
                      {SALE_TYPES.map((type) => (
                        <label
                          className='flex cursor-pointer items-center gap-2 text-sm'
                          htmlFor={`sale-type-${type.value}`}
                          key={type.value}
                        >
                          <input
                            checked={formData.saleType === type.value}
                            className='size-4 accent-primary'
                            disabled={isSubmitting}
                            id={`sale-type-${type.value}`}
                            name='saleType'
                            onChange={handleInputChange}
                            type='radio'
                            value={type.value}
                          />
                          {t(type.labelKey)}
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  {formData.saleType === 'fixed-price' ? (
                    <div className='space-y-2'>
                      <Label htmlFor='pricePerTonne'>{t('form.price')}</Label>
                      <Input
                        disabled={isSubmitting}
                        id='pricePerTonne'
                        name='pricePerTonne'
                        onChange={handleInputChange}
                        placeholder={t('form.pricePlaceholder')}
                        step='0.01'
                        type='number'
                        value={formData.pricePerTonne}
                      />
                    </div>
                  ) : (
                    <>
                      <div className='space-y-2'>
                        <Label htmlFor='auctionStartPrice'>
                          {t('form.startBid')}
                        </Label>
                        <Input
                          disabled={isSubmitting}
                          id='auctionStartPrice'
                          name='auctionStartPrice'
                          onChange={handleInputChange}
                          placeholder={t('form.startBidPlaceholder')}
                          step='0.01'
                          type='number'
                          value={formData.auctionStartPrice}
                        />
                      </div>
                      <div className='space-y-2'>
                        <Label htmlFor='auctionEndTime'>
                          {t('form.endDate')}
                        </Label>
                        <Input
                          disabled={isSubmitting}
                          id='auctionEndTime'
                          name='auctionEndTime'
                          onChange={handleInputChange}
                          type='datetime-local'
                          value={formData.auctionEndTime}
                        />
                      </div>
                    </>
                  )}

                  {minPriceError && (
                    <p className='text-destructive text-sm' role='alert'>
                      {minPriceError}
                    </p>
                  )}

                  {formData.saleType === 'fixed-price' &&
                    formData.amount &&
                    formData.pricePerTonne && (
                      <div className='border border-dashed p-4'>
                        <p className='text-muted-foreground text-sm'>
                          {t('form.revenue')}
                        </p>
                        <p className='font-bold text-emerald-600 text-lg dark:text-emerald-400'>
                          {`$${revenuePreview}`}
                        </p>
                      </div>
                    )}

                  <Button
                    className='w-full'
                    disabled={isSubmitting || minPriceError !== null}
                    type='submit'
                  >
                    {isSubmitting ? t('form.creating') : t('form.submit')}
                  </Button>
                </form>
              ) : (
                <div className='py-8 text-center'>
                  <p className='mb-2 text-muted-foreground'>{t('wrap.none')}</p>
                  <p className='text-muted-foreground text-sm'>
                    {t('wrap.hint')}
                  </p>
                  {wrappableCredits.length > 0 && (
                    <div className='mx-auto mt-6 max-w-xl space-y-3 text-left'>
                      <p className='text-sm'>{t('wrap.prompt')}</p>
                      {wrappableCredits
                        .slice(0, MAX_WRAP_SUGGESTIONS)
                        .map((credit) => {
                          const blocker = getWrapBlocker(
                            credit,
                            CCT_POOLS.VERRA_VCS
                          );
                          return (
                            <div
                              className='flex items-center justify-between gap-3 border border-dashed p-3'
                              key={credit.tokenId}
                            >
                              <div>
                                <p className='font-medium text-sm'>
                                  {t('wrap.token', { id: credit.tokenId })}
                                </p>
                                <p className='text-muted-foreground text-xs'>
                                  {Number(credit.co2Tonnes || 0).toFixed(2)}{' '}
                                  tCO₂ • {credit.methodology}
                                </p>
                                {blocker ? (
                                  <p className='mt-1 text-amber-600 text-xs dark:text-amber-400'>
                                    {t(`wrap.blocked.${blocker}`)}
                                  </p>
                                ) : null}
                              </div>
                              <Button
                                disabled={
                                  wrappingTokenId !== null || blocker !== null
                                }
                                onClick={() => handleWrapCredit(credit.tokenId)}
                                type='button'
                              >
                                {wrappingTokenId === credit.tokenId
                                  ? t('wrap.wrapping')
                                  : t('wrap.action')}
                              </Button>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent className='mt-4 space-y-4' value='active'>
          {activeListings.length > 0 ? (
            activeListings.map((listing) => (
              <Card
                className='rounded-none border-dashed shadow-none'
                key={`${listing.saleType}-${listing.id}`}
              >
                <CardContent className='flex items-start justify-between gap-4'>
                  <div className='flex-1'>
                    <div className='mb-4 flex flex-wrap items-center gap-3'>
                      <h3 className='font-semibold text-lg'>
                        {t('listing.tonnes', { amount: listing.amount })}
                      </h3>
                      <Badge variant='secondary'>
                        {listing.saleType === 'fixed-price'
                          ? t('saleType.badgeFixed')
                          : t('saleType.auction')}
                      </Badge>
                      <span className='text-muted-foreground text-xs'>
                        {t('listing.listedAgo', {
                          hours: Math.floor(
                            (Date.now() - listing.listedAt) / MS_PER_HOUR
                          ),
                        })}
                      </span>
                    </div>

                    <div className='grid grid-cols-3 gap-4 text-sm'>
                      <div>
                        <p className='text-muted-foreground'>
                          {t('listing.pricePerTonne')}
                        </p>
                        <p className='font-bold'>${listing.pricePerTonne}</p>
                      </div>
                      <div>
                        <p className='text-muted-foreground'>
                          {t('listing.totalValue')}
                        </p>
                        <p className='font-bold'>
                          ${listing.totalValue.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className='text-muted-foreground'>
                          {t('listing.status')}
                        </p>
                        <p className='font-bold text-emerald-600 dark:text-emerald-400'>
                          {t(`listing.status.${listing.status}`)}
                        </p>
                      </div>
                    </div>
                  </div>

                  <Button
                    disabled={listing.status !== 'active'}
                    onClick={() =>
                      handleCancelListing(listing.id, listing.saleType)
                    }
                    size='sm'
                    type='button'
                    variant='secondary'
                  >
                    {t('listing.cancel')}
                  </Button>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className='rounded-none border-dashed shadow-none'>
              <CardContent>
                <EmptyState
                  action={
                    <Button onClick={() => setTab('list')} type='button'>
                      {t('listing.createFirst')}
                    </Button>
                  }
                  description={t('listing.emptyDescription')}
                  title={t('listing.emptyTitle')}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SellCredits;
