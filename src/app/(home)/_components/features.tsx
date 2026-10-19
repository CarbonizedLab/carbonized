'use client';

import { cva } from 'class-variance-authority';
import {
  Gavel as AuctionIcon,
  Coins as CoinsIcon,
  ShieldCheck as ShieldCheckIcon,
  ArrowLeftRight as TradeIcon,
  Wallet as WalletIcon,
} from 'lucide-react';
import { InlineLink } from '@/components/inline-link';
import { Section } from '@/components/section';

// Create a variant for feature items
const featureItemVariants = cva(
  'group flex flex-col justify-between gap-10 p-6 last:border-border last:border-b last:border-dashed hover:bg-card hover:bg-card/80 sm:gap-22 md:gap-34 lg:gap-46',
  {
    variants: {
      size: {
        sm: '',
        lg: 'lg:col-span-2',
      },
    },
    defaultVariants: {
      size: 'sm',
    },
  }
);

const features = [
  {
    id: 1,
    Icon: ShieldCheckIcon,
    title: 'Onchain credit records',
    description:
      'Credits are minted as NFTs by an authorized issuer role, with project metadata, a serial number and a proof hash recorded onchain. Verification is currently performed by the admin/issuer; automated oracle verification is not live yet. NFTs can be wrapped into fungible ERC-20 pool tokens for trading.',
    size: 'lg',
  },
  {
    id: 2,
    Icon: TradeIcon,
    title: 'Order book',
    description:
      'A fixed-price order book settled onchain in USDG. The trading fee is currently 0.25%, and the admin can change it within a cap set in the contract.',
    size: 'sm',
  },
  {
    id: 3,
    Icon: AuctionIcon,
    title: 'Auctions',
    description:
      'Discover fair prices for large or rare credit batches through transparent onchain auctions.',
    size: 'sm',
  },
  {
    id: 4,
    Icon: WalletIcon,
    title: 'Portfolio & company tracking',
    description:
      'See holdings, retirements and onchain activity per wallet, and let companies register and record self-reported emissions next to their retirements. There is no integration with the national ETS or CCER registries today.',
    size: 'lg',
  },
  {
    id: 5,
    Icon: CoinsIcon,
    title: 'CARB utility (coming)',
    description:
      'CARB is Carbonized\'s utility token (official contract 0x48d134b04238ab7fb9134e6fc47149c39f3d022c). Its utilities are not live yet and are limited to: reduced marketplace trading fees by staking tier (a discount on the fee, never on the price), an issuer bond for the bond-based issuer path, and parameter governance by token holders. No revenue share, no staking rewards, no returns, and no price or allocation commitments. Subject to legal review and independent audit. Not investment advice or an offer.',
    size: 'sm',
    href: '/docs/token',
  },
];

const Features = () => (
  <Section className='relative w-full pt-10'>
    <div className='flex flex-col gap-10'>
      <div className='flex flex-col gap-2 px-6'>
        <h2 className='max-w-xl text-left font-regular text-3xl tracking-tighter md:text-5xl'>
          Why Carbonized?
        </h2>
        <p className='max-w-xl text-left text-lg text-muted-foreground leading-relaxed tracking-tight lg:max-w-lg'>
          Carbonized explores onchain transparency, retirement records and
          liquidity for carbon markets. It is early-stage software.
        </p>
      </div>

      <div className='w-full border-border border-t border-dashed pb-4'>
        <div className='grid grid-cols-1 divide-x divide-y divide-dashed divide-border text-left sm:grid-cols-2 lg:grid-cols-3'>
          {features.map((feature) => (
            <div
              className={featureItemVariants({
                size: feature.size as 'sm' | 'lg',
              })}
              key={feature.id}
            >
              <feature.Icon className='h-8 w-8 stroke-1 transition-transform hover:rotate-12 hover:scale-125' />
              <div className='flex flex-col'>
                <h3 className='text-xl tracking-tight transition-all'>
                  {feature.title}
                </h3>
                <p className='max-w-xs text-base text-muted-foreground transition-all'>
                  {feature.description}
                </p>
                {feature.href ? (
                  <InlineLink className='text-base' href={feature.href}>
                    Read the token docs
                  </InlineLink>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </Section>
);
export default Features;
