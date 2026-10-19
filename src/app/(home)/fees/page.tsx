import type { Metadata } from 'next';
import Link from 'next/link';
import Balancer from 'react-wrap-balancer';
import { Section } from '@/components/section';
import { createMetadata } from '@/lib/metadata';

const title = 'Fees';
const description =
  'What using Carbonized costs: browsing and connecting a wallet are free, the seller pays a small fee at settlement, and network gas is paid in ETH.';

export const metadata: Metadata = createMetadata({ title, description });

// Defaults and bounds below are read from the contract sources:
// CarbonMarketplace.sol (`tradingFeePercent`, `MAX_TRADING_FEE`, `MAX_FEE_DISCOUNT_BPS`)
// and scripts/lib/deploy-core.js (`CARB_DEFAULTS.staking`).
const DEFAULT_FEE_BPS = 25;
const MAX_FEE_BPS = 100;
const MAX_DISCOUNT_BPS = 5000;
const BPS_DENOMINATOR = 10_000;

const EXAMPLE_TONNES = 100;
const EXAMPLE_PRICE_USD = 25;
const EXAMPLE_TOTAL_USD = EXAMPLE_TONNES * EXAMPLE_PRICE_USD;

const percent = (bps: number) => `${bps / 100}%`;
const usd = (value: number) =>
  `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })}`;

const TIERS = [
  { tier: 0, stake: 'Below 1,000 CARB', discountBps: 0 },
  { tier: 1, stake: '1,000 CARB or more', discountBps: 1000 },
  { tier: 2, stake: '5,000 CARB or more', discountBps: 2500 },
  { tier: 3, stake: '25,000 CARB or more', discountBps: 5000 },
] as const;

const BASE_FEE_USD = (EXAMPLE_TOTAL_USD * DEFAULT_FEE_BPS) / BPS_DENOMINATOR;

const rules = [
  {
    title: 'Browsing and wallet connection',
    body: 'Free. Exploring the marketplace, reading the docs and connecting a wallet cost nothing.',
  },
  {
    title: 'Order book and auctions',
    body: `The seller pays the fee at settlement. The default is ${percent(DEFAULT_FEE_BPS)} (${DEFAULT_FEE_BPS} basis points) of the sale value. The rate is snapshotted when an order or auction is created, so a later change never raises what you were shown. The rate can be changed by the contract administrator, or by governance once the parameter role is handed to the timelock, never above ${percent(MAX_FEE_BPS)} (MAX_TRADING_FEE = ${MAX_FEE_BPS} bps).`,
  },
  {
    title: 'AMM swaps',
    body: `Swaps use the same fee rate (default ${percent(DEFAULT_FEE_BPS)}, same ${percent(MAX_FEE_BPS)} cap), taken from the amount you swap in. It stays in the pool for liquidity providers and is not discounted by staking.`,
  },
  {
    title: 'Network gas',
    body: 'Every transaction pays gas in ETH to the network. Carbonized does not receive it and cannot change it.',
  },
  {
    title: 'CARB staking tiers',
    body: `When CARB is live, staking lowers the seller fee by a share of the fee (never more than ${percent(MAX_DISCOUNT_BPS)} of it). CARB staking is not live yet, so no discount applies today. Staking pays no rewards.`,
  },
  {
    title: 'Issuer bond',
    body: 'A deposit, not a fee. Bonded CARB stays yours unless it is slashed after a dispute, and it can be withdrawn after the unbonding delay.',
  },
] as const;

const notCharged = [
  'No subscription plans',
  'No API access',
  'No ESG report exports',
  'No service-level agreements',
  'No charge for browsing or connecting a wallet',
  'No fee on retirements or certificates, beyond network gas',
] as const;

export default function FeesPage() {
  return (
    <>
      <Section className='flex flex-col items-center p-6 text-center lg:p-12'>
        <h1 className='mb-2 font-normal text-3xl leading-tight tracking-tighter md:text-5xl'>
          {title}
        </h1>
        <p className='max-w-xl text-md text-muted-foreground'>
          <Balancer>{description}</Balancer>
        </p>
      </Section>

      <Section>
        <div className='grid divide-y divide-dashed divide-border'>
          {rules.map((rule) => (
            <div className='p-6' key={rule.title}>
              <h2 className='mb-2 font-semibold text-xl tracking-tight'>
                {rule.title}
              </h2>
              <p className='text-muted-foreground text-sm md:text-base'>
                {rule.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section>
        <div className='p-6'>
          <h2 className='mb-2 font-semibold text-xl tracking-tight'>
            Staking tiers (when CARB is live)
          </h2>
          <p className='mb-4 text-muted-foreground text-sm'>
            Default tier table from the deployment helper. Parameters may change
            before launch, and only stake that has finished its warm-up counts.
          </p>
          <div className='overflow-x-auto'>
            <table className='w-full text-left text-sm'>
              <thead>
                <tr className='border-border border-b'>
                  <th className='py-2 pr-4 font-medium'>Tier</th>
                  <th className='py-2 pr-4 font-medium'>Staked</th>
                  <th className='py-2 pr-4 font-medium'>Share of fee waived</th>
                  <th className='py-2 font-medium'>
                    Seller fee on default rate
                  </th>
                </tr>
              </thead>
              <tbody>
                {TIERS.map((row) => (
                  <tr className='border-border border-b' key={row.tier}>
                    <td className='py-2 pr-4'>{row.tier}</td>
                    <td className='py-2 pr-4'>{row.stake}</td>
                    <td className='py-2 pr-4'>{percent(row.discountBps)}</td>
                    <td className='py-2'>
                      {(
                        (DEFAULT_FEE_BPS *
                          (BPS_DENOMINATOR - row.discountBps)) /
                        BPS_DENOMINATOR /
                        100
                      ).toFixed(4)}
                      %
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section>
        <div className='p-6'>
          <h2 className='mb-2 font-semibold text-xl tracking-tight'>
            Worked example (illustration only)
          </h2>
          <p className='text-muted-foreground text-sm md:text-base'>
            A seller sells {EXAMPLE_TONNES} t at ${EXAMPLE_PRICE_USD} per tonne,
            a sale value of {usd(EXAMPLE_TOTAL_USD)}. At the default{' '}
            {percent(DEFAULT_FEE_BPS)} the seller fee is {usd(BASE_FEE_USD)} and
            the seller receives {usd(EXAMPLE_TOTAL_USD - BASE_FEE_USD)}. With a
            tier 3 stake (when CARB is live) the fee drops to{' '}
            {usd(
              (BASE_FEE_USD * (BPS_DENOMINATOR - MAX_DISCOUNT_BPS)) /
                BPS_DENOMINATOR
            )}
            . The buyer pays the listed price; network gas is extra for both
            sides. Figures are illustrative, not a quote, and the fee in force
            is the one read from the contract when the order is created.
          </p>
        </div>
      </Section>

      <Section>
        <div className='p-6'>
          <h2 className='mb-2 font-semibold text-xl tracking-tight'>
            What we do not charge
          </h2>
          <ul className='ml-4 list-disc space-y-1 text-muted-foreground text-sm md:text-base'>
            {notCharged.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className='mt-4 text-muted-foreground text-sm'>
            See the{' '}
            <Link className='underline' href='/docs/token/staking-and-tiers'>
              staking docs
            </Link>{' '}
            and the{' '}
            <Link className='underline' href='/terms'>
              terms
            </Link>{' '}
            for details.
          </p>
        </div>
      </Section>
    </>
  );
}
