'use client';

import { Gem } from 'lucide-react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { useFeeTier } from '@/hooks/use-carb-data';
import { bpsToPercent, CARB, discountedFeeBps } from '@/lib/carb';
import { formatDecimal } from '@/lib/chain-format';
import { type Messages, useLocaleStore, useT } from '@/lib/i18n';

const FEE_FRACTION_DIGITS = 4;
const BPS_PER_PERCENT = 100;

const messages: Messages = {
  en: {
    'tier.none':
      'Your fee tier: {tier}. No fee discount. Staking CARB can lower the trading fee you pay as a seller.',
    'tier.some':
      'Your fee tier: {tier}. {discount}% off the trading fee you pay as a seller ({from}% becomes {to}%). The discount applies to the fee only, never to the price.',
    'tier.link': 'About CARB tiers',
    'tier.name': 'Tier {tier}',
  },
  zh: {
    'tier.none':
      '您的手续费等级：{tier}。暂无手续费减免。质押 CARB 可降低您作为卖方支付的交易手续费。',
    'tier.some':
      '您的手续费等级：{tier}。作为卖方支付的交易手续费减免 {discount}%（{from}% 降为 {to}%）。减免仅针对手续费，不影响价格。',
    'tier.link': '了解 CARB 等级',
    'tier.name': '{tier} 级',
  },
};

const FeeTierLine = () => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);
  const { address } = useAccount();
  const tier = useFeeTier(address);

  if (!tier.data) {
    return null;
  }
  const { discountBps, feeBps } = tier.data;
  const name = t('tier.name', { tier: tier.data.tier });
  const text =
    discountBps === 0n
      ? t('tier.none', { tier: name })
      : t('tier.some', {
          tier: name,
          discount: bpsToPercent(discountBps),
          from: formatDecimal(
            Number(feeBps) / BPS_PER_PERCENT,
            locale,
            FEE_FRACTION_DIGITS
          ),
          to: formatDecimal(
            discountedFeeBps(feeBps, discountBps) / BPS_PER_PERCENT,
            locale,
            FEE_FRACTION_DIGITS
          ),
        });

  return (
    <p className='flex items-start gap-2 border border-dashed p-3 text-muted-foreground text-xs'>
      <Gem aria-hidden='true' className='mt-0.5 size-4 shrink-0 text-primary' />
      <span>
        {text}{' '}
        <Link className='underline' href='/app/token'>
          {t('tier.link')}
        </Link>
      </span>
    </p>
  );
};

/** Informational fee-tier line; renders nothing unless the CARB staking contract is configured. */
export const FeeTierNote = () => (CARB.staking ? <FeeTierLine /> : null);
