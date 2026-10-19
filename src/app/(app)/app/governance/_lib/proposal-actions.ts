import {
  type Address,
  encodeFunctionData,
  formatUnits,
  type Hex,
  isAddress,
  zeroAddress,
} from 'viem';
import {
  ABI_CARB_STAKING,
  ABI_ISSUER_BOND,
  ABI_MARKETPLACE_PARAMS,
  CONTRACTS,
} from '@/config/contracts';
import { CARB, isAddressSet } from '@/lib/carb';
import { parseAmountInput } from '@/lib/token-units';

// Bounds enforced by the contracts (CarbStaking / IssuerBond / CarbonMarketplace); the form
// checks them first so a doomed proposal is never submitted. They are in WHOLE tokens and scale with the
// CARB token's own `decimals()` (an external token need not have 18).
const MIN_THRESHOLD_TOKENS = 1n;
const MAX_THRESHOLD_TOKENS = 50_000_000n;
const MIN_BOND_FLOOR_TOKENS = 1n;
const MAX_MIN_BOND_TOKENS = 100_000_000n;
const unitOf = (decimals: number): bigint => 10n ** BigInt(decimals);
const MAX_TRADING_FEE_BPS = 100n;
const BPS_PER_PERCENT = 100;
const INTEGER_PATTERN = /^\d+$/;

export type ActionId =
  | 'minPrice'
  | 'tradingFee'
  | 'kycGate'
  | 'discountProvider'
  | 'stakingThresholds'
  | 'bondMinimum';

type Vars = Record<string, string | number>;

export interface Message {
  key: string;
  vars?: Vars;
}

/** Current onchain values, shown as "from X to Y" in the summary. */
export interface ParamSnapshot {
  minPrice: bigint | null;
  feeBps: bigint | null;
  kycGate: boolean | null;
  provider: Address | null;
  thresholds: readonly [bigint, bigint, bigint] | null;
  minBond: bigint | null;
}

export interface BuildContext {
  /** Decimals of the payment token (USDG: 6). */
  paymentDecimals: number | null;
  carbDecimals: number;
  /** Marketplace `MAX_MIN_PRICE_PER_TONNE`, when readable. */
  maxMinPrice: bigint | null;
  current: ParamSnapshot;
}

export interface BuiltCall {
  calldata: Hex;
  /** Function name for the decoded display. */
  functionName: string;
  /** Plain argument strings for the decoded display. */
  args: string[];
  /** Address that must have contract code when the proposal runs. */
  requiresCode?: Address;
}

export type BuildResult =
  | { ok: true; call: BuiltCall; summary: Message }
  | { ok: false; errors: Record<string, Message> };

export interface FieldDef {
  name: string;
  labelKey: string;
  hintKey?: string;
  kind: 'text' | 'choice';
  options?: readonly { value: string; labelKey: string }[];
  placeholder?: string;
  mono?: boolean;
  /** Only render the field when this returns true for the current values. */
  showWhen?: (values: Record<string, string>) => boolean;
}

export interface ActionDef {
  id: ActionId;
  labelKey: string;
  descriptionKey: string;
  /** Contract the call goes to; null when it is not configured (the action is then unavailable). */
  target: Address | null;
  fields: readonly FieldDef[];
  build: (values: Record<string, string>, ctx: BuildContext) => BuildResult;
}

const INCOMPLETE: BuildResult = { ok: false, errors: {} };

const fail = (field: string, key: string, vars?: Vars): BuildResult => ({
  ok: false,
  errors: { [field]: { key, vars } },
});

const show = (value: bigint | null, decimals: number): string =>
  value === null ? '?' : formatUnits(value, decimals);

const buildMinPrice = (
  values: Record<string, string>,
  ctx: BuildContext
): BuildResult => {
  const raw = (values.price ?? '').trim();
  const decimals = ctx.paymentDecimals;
  if (raw === '' || decimals === null) {
    return INCOMPLETE;
  }
  const price = parseAmountInput(raw, decimals);
  if (price === null) {
    return fail('price', 'err.price', { decimals });
  }
  if (ctx.maxMinPrice !== null && price > ctx.maxMinPrice) {
    return fail('price', 'err.priceMax', {
      max: formatUnits(ctx.maxMinPrice, decimals),
    });
  }
  return {
    ok: true,
    call: {
      calldata: encodeFunctionData({
        abi: ABI_MARKETPLACE_PARAMS,
        functionName: 'setMinPricePerTonne',
        args: [price],
      }),
      functionName: 'setMinPricePerTonne',
      args: [price.toString()],
    },
    summary: {
      key: 'sum.minPrice',
      vars: {
        from: show(ctx.current.minPrice, decimals),
        to: formatUnits(price, decimals),
      },
    },
  };
};

const buildTradingFee = (
  values: Record<string, string>,
  ctx: BuildContext
): BuildResult => {
  const raw = (values.bps ?? '').trim();
  if (raw === '') {
    return INCOMPLETE;
  }
  if (!INTEGER_PATTERN.test(raw)) {
    return fail('bps', 'err.fee', { max: Number(MAX_TRADING_FEE_BPS) });
  }
  const bps = BigInt(raw);
  if (bps > MAX_TRADING_FEE_BPS) {
    return fail('bps', 'err.fee', { max: Number(MAX_TRADING_FEE_BPS) });
  }
  return {
    ok: true,
    call: {
      calldata: encodeFunctionData({
        abi: ABI_MARKETPLACE_PARAMS,
        functionName: 'setTradingFee',
        args: [bps],
      }),
      functionName: 'setTradingFee',
      args: [bps.toString()],
    },
    summary: {
      key: 'sum.fee',
      vars: {
        from: ctx.current.feeBps === null ? '?' : ctx.current.feeBps.toString(),
        to: bps.toString(),
        percent: Number(bps) / BPS_PER_PERCENT,
      },
    },
  };
};

const buildKycGate = (values: Record<string, string>): BuildResult => {
  const choice = values.enabled ?? '';
  if (choice !== 'on' && choice !== 'off') {
    return INCOMPLETE;
  }
  const enabled = choice === 'on';
  return {
    ok: true,
    call: {
      calldata: encodeFunctionData({
        abi: ABI_MARKETPLACE_PARAMS,
        functionName: 'setKYCGate',
        args: [enabled],
      }),
      functionName: 'setKYCGate',
      args: [String(enabled)],
    },
    summary: { key: enabled ? 'sum.kycOn' : 'sum.kycOff' },
  };
};

const buildProvider = (values: Record<string, string>): BuildResult => {
  const mode = values.mode ?? '';
  if (mode === 'off') {
    return {
      ok: true,
      call: {
        calldata: encodeFunctionData({
          abi: ABI_MARKETPLACE_PARAMS,
          functionName: 'setFeeDiscountProvider',
          args: [zeroAddress],
        }),
        functionName: 'setFeeDiscountProvider',
        args: [zeroAddress],
      },
      summary: { key: 'sum.providerOff' },
    };
  }
  if (mode !== 'set') {
    return INCOMPLETE;
  }
  const raw = (values.provider ?? '').trim();
  if (raw === '') {
    return INCOMPLETE;
  }
  if (!isAddress(raw) || raw === zeroAddress) {
    return fail('provider', 'err.address');
  }
  return {
    ok: true,
    call: {
      calldata: encodeFunctionData({
        abi: ABI_MARKETPLACE_PARAMS,
        functionName: 'setFeeDiscountProvider',
        args: [raw],
      }),
      functionName: 'setFeeDiscountProvider',
      args: [raw],
      requiresCode: raw,
    },
    summary: { key: 'sum.providerSet', vars: { address: raw } },
  };
};

const THRESHOLD_FIELDS = ['t1', 't2', 't3'] as const;

const buildThresholds = (
  values: Record<string, string>,
  ctx: BuildContext
): BuildResult => {
  const raws = THRESHOLD_FIELDS.map((name) => (values[name] ?? '').trim());
  if (raws.some((raw) => raw === '')) {
    return INCOMPLETE;
  }
  const parsed = raws.map((raw) => parseAmountInput(raw, ctx.carbDecimals));
  const errors: Record<string, Message> = {};
  THRESHOLD_FIELDS.forEach((name, index) => {
    if (parsed[index] === null) {
      errors[name] = { key: 'err.carb', vars: { decimals: ctx.carbDecimals } };
    }
  });
  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  const [t1, t2, t3] = parsed as [bigint, bigint, bigint];
  if (t1 < unitOf(ctx.carbDecimals) * MIN_THRESHOLD_TOKENS) {
    return fail('t1', 'err.thresholdLow');
  }
  if (!(t1 < t2)) {
    return fail('t2', 'err.thresholdOrder');
  }
  if (!(t2 < t3)) {
    return fail('t3', 'err.thresholdOrder');
  }
  const maxThreshold = unitOf(ctx.carbDecimals) * MAX_THRESHOLD_TOKENS;
  if (t3 > maxThreshold) {
    return fail('t3', 'err.thresholdHigh', {
      max: formatUnits(maxThreshold, ctx.carbDecimals),
    });
  }
  const from = ctx.current.thresholds;
  return {
    ok: true,
    call: {
      calldata: encodeFunctionData({
        abi: ABI_CARB_STAKING,
        functionName: 'setTierThresholds',
        args: [[t1, t2, t3]],
      }),
      functionName: 'setTierThresholds',
      args: [`[${[t1, t2, t3].join(', ')}]`],
    },
    summary: {
      key: 'sum.thresholds',
      vars: {
        t1: formatUnits(t1, ctx.carbDecimals),
        t2: formatUnits(t2, ctx.carbDecimals),
        t3: formatUnits(t3, ctx.carbDecimals),
        f1: show(from?.[0] ?? null, ctx.carbDecimals),
        f2: show(from?.[1] ?? null, ctx.carbDecimals),
        f3: show(from?.[2] ?? null, ctx.carbDecimals),
      },
    },
  };
};

const buildMinBond = (
  values: Record<string, string>,
  ctx: BuildContext
): BuildResult => {
  const raw = (values.minBond ?? '').trim();
  if (raw === '') {
    return INCOMPLETE;
  }
  const amount = parseAmountInput(raw, ctx.carbDecimals);
  if (amount === null) {
    return fail('minBond', 'err.carb', { decimals: ctx.carbDecimals });
  }
  const bondFloor = unitOf(ctx.carbDecimals) * MIN_BOND_FLOOR_TOKENS;
  const bondCeiling = unitOf(ctx.carbDecimals) * MAX_MIN_BOND_TOKENS;
  if (amount < bondFloor || amount > bondCeiling) {
    return fail('minBond', 'err.bondBounds', {
      min: formatUnits(bondFloor, ctx.carbDecimals),
      max: formatUnits(bondCeiling, ctx.carbDecimals),
    });
  }
  return {
    ok: true,
    call: {
      calldata: encodeFunctionData({
        abi: ABI_ISSUER_BOND,
        functionName: 'setMinBond',
        args: [amount],
      }),
      functionName: 'setMinBond',
      args: [amount.toString()],
    },
    summary: {
      key: 'sum.minBond',
      vars: {
        from: show(ctx.current.minBond, ctx.carbDecimals),
        to: formatUnits(amount, ctx.carbDecimals),
      },
    },
  };
};

const marketplaceTarget = (): Address | null =>
  isAddressSet(CONTRACTS.carbonMarketplace)
    ? CONTRACTS.carbonMarketplace
    : null;

/**
 * The only changes the guided form can encode. Every action targets one fixed, configured protocol
 * contract: there is no free-form target or calldata, so nothing outside this list can be proposed here.
 */
export const ACTIONS: readonly ActionDef[] = [
  {
    id: 'minPrice',
    labelKey: 'act.minPrice',
    descriptionKey: 'act.minPrice.desc',
    target: marketplaceTarget(),
    fields: [
      {
        name: 'price',
        kind: 'text',
        labelKey: 'f.price',
        hintKey: 'f.price.hint',
        placeholder: '0.01',
      },
    ],
    build: buildMinPrice,
  },
  {
    id: 'tradingFee',
    labelKey: 'act.fee',
    descriptionKey: 'act.fee.desc',
    target: marketplaceTarget(),
    fields: [
      {
        name: 'bps',
        kind: 'text',
        labelKey: 'f.fee',
        hintKey: 'f.fee.hint',
        placeholder: '25',
      },
    ],
    build: buildTradingFee,
  },
  {
    id: 'kycGate',
    labelKey: 'act.kyc',
    descriptionKey: 'act.kyc.desc',
    target: marketplaceTarget(),
    fields: [
      {
        name: 'enabled',
        kind: 'choice',
        labelKey: 'f.kyc',
        options: [
          { value: 'on', labelKey: 'f.kyc.on' },
          { value: 'off', labelKey: 'f.kyc.off' },
        ],
      },
    ],
    build: buildKycGate,
  },
  {
    id: 'discountProvider',
    labelKey: 'act.provider',
    descriptionKey: 'act.provider.desc',
    target: marketplaceTarget(),
    fields: [
      {
        name: 'mode',
        kind: 'choice',
        labelKey: 'f.providerMode',
        options: [
          { value: 'set', labelKey: 'f.providerMode.set' },
          { value: 'off', labelKey: 'f.providerMode.off' },
        ],
      },
      {
        name: 'provider',
        kind: 'text',
        labelKey: 'f.provider',
        hintKey: 'f.provider.hint',
        placeholder: '0x…',
        mono: true,
        showWhen: (values) => values.mode === 'set',
      },
    ],
    build: buildProvider,
  },
  {
    id: 'stakingThresholds',
    labelKey: 'act.thresholds',
    descriptionKey: 'act.thresholds.desc',
    target: CARB.staking,
    fields: [
      { name: 't1', kind: 'text', labelKey: 'f.t1', placeholder: '1000' },
      { name: 't2', kind: 'text', labelKey: 'f.t2', placeholder: '5000' },
      { name: 't3', kind: 'text', labelKey: 'f.t3', placeholder: '25000' },
    ],
    build: buildThresholds,
  },
  {
    id: 'bondMinimum',
    labelKey: 'act.minBond',
    descriptionKey: 'act.minBond.desc',
    target: CARB.bond,
    fields: [
      {
        name: 'minBond',
        kind: 'text',
        labelKey: 'f.minBond',
        hintKey: 'f.minBond.hint',
        placeholder: '10000',
      },
    ],
    build: buildMinBond,
  },
];

/** Contracts the form may target (marketplace, staking, issuer bond), when configured. */
export const governedTargets = (): Address[] =>
  ACTIONS.flatMap((action) => (action.target ? [action.target] : []));

export const isGovernedTarget = (target: string): boolean =>
  governedTargets().some(
    (allowed) => allowed.toLowerCase() === target.toLowerCase()
  );

const PLACEHOLDER_PATTERN = /\{(\w+)\}/g;

/** Fills `{name}` placeholders (used to render the summary in English for the onchain description). */
export const fillTemplate = (template: string, vars: Vars = {}): string =>
  template.replace(PLACEHOLDER_PATTERN, (_, name: string) =>
    String(vars[name] ?? `{${name}}`)
  );
