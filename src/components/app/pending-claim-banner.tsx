'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useContractInteraction } from '@/hooks/use-contract-interaction';
import { usePaymentDecimals } from '@/hooks/use-payment-decimals';
import { type Messages, useT } from '@/lib/i18n';
import { formatAmountInput } from '@/lib/token-units';

const messages: Messages = {
  en: {
    'claim.banner':
      'You have {amount} USDG waiting to be claimed (a refund or proceeds could not be sent directly to your wallet).',
    'claim.action': 'Claim',
    'claim.claiming': 'Claiming...',
    'claim.success': 'Payment claimed.',
    'claim.failed': 'Claim failed',
  },
  zh: {
    'claim.banner':
      '您有 {amount} USDG 待领取(退款或收益无法直接发送到您的钱包)。',
    'claim.action': '领取',
    'claim.claiming': '领取中...',
    'claim.success': '已领取付款。',
    'claim.failed': '领取失败',
  },
};

/**
 * Shows a Claim action when the marketplace holds a deferred payment for the
 * connected wallet (`pendingWithdrawals`), e.g. after a blocked USDG transfer.
 */
export const PendingClaimBanner = () => {
  const t = useT(messages);
  const { address, isConnected, getPendingWithdrawals, claimPending } =
    useContractInteraction();
  const { decimals } = usePaymentDecimals();
  const [pending, setPending] = useState<bigint>(0n);
  const [claiming, setClaiming] = useState(false);

  const refresh = useCallback(async () => {
    if (!(isConnected && address)) {
      setPending(0n);
      return;
    }
    setPending((await getPendingWithdrawals(address)) ?? 0n);
  }, [isConnected, address, getPendingWithdrawals]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleClaim = async () => {
    setClaiming(true);
    try {
      await claimPending();
      toast.success(t('claim.success'));
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      toast.error(message || t('claim.failed'));
    } finally {
      setClaiming(false);
    }
  };

  if (pending === 0n || decimals === undefined) {
    return null;
  }

  return (
    <output className='flex flex-wrap items-center justify-between gap-2 border border-amber-500/40 border-dashed bg-amber-500/10 p-3 text-amber-700 text-sm dark:text-amber-300'>
      <span>
        {t('claim.banner', { amount: formatAmountInput(pending, decimals) })}
      </span>
      <Button disabled={claiming} onClick={handleClaim} size='sm' type='button'>
        {claiming ? t('claim.claiming') : t('claim.action')}
      </Button>
    </output>
  );
};
