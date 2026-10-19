import type {
  Address,
  Hash,
  PublicClient,
  TransactionReceipt,
  WalletClient,
} from 'viem';
import { zeroAddress } from 'viem';
import {
  ABI_CARB_GOVERNOR,
  ABI_CARB_STAKING,
  ABI_CARB_TOKEN,
  ABI_CARB_VOTES,
  ABI_ISSUER_BOND,
  CARB_EXTERNAL_FLAG,
  CONTRACTS,
} from '@/config/contracts';
import { formatDecimal } from '@/lib/chain-format';
import type { Locale } from '@/lib/i18n';
import { registryErrorMessage } from '@/lib/registry';
import { toDisplayNumber } from '@/lib/token-units';
import { writeContractOnTargetChain } from '@/lib/wallet-write';

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const ZERO_ADDRESS_PATTERN = /^0x0{40}$/;

const SECONDS_PER_DAY = 86_400;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;

// CARB decimals are NEVER assumed: the token's own `decimals()` is read onchain (an external token need not use 18).
export const BPS_DENOMINATOR = 10_000n;
export const TIER_COUNT = 4;

const pickAddress = (value: string): Address | null =>
  ADDRESS_PATTERN.test(value) && !ZERO_ADDRESS_PATTERN.test(value)
    ? (value as Address)
    : null;

/**
 * CARB utility contracts. Every entry is `null` until its `NEXT_PUBLIC_*` variable is
 * set: nothing else in the app depends on them, so an unset stack means "not live yet".
 */
export const CARB = {
  token: pickAddress(CONTRACTS.carbToken),
  staking: pickAddress(CONTRACTS.carbStaking),
  bond: pickAddress(CONTRACTS.issuerBond),
  governor: pickAddress(CONTRACTS.governor),
  timelock: pickAddress(CONTRACTS.timelock),
  /** Voting wrapper (CarbVotes) around an external CARB; null when votes live on the CARB token itself. */
  votes: pickAddress(CONTRACTS.carbVotes),
  /** Where delegation and voting power live: the wrapper when configured, else the CARB token. */
  votingToken:
    pickAddress(CONTRACTS.carbVotes) ?? pickAddress(CONTRACTS.carbToken),
  /** CARB is an external (launchpad) token, not Carbonized's own CarbToken. */
  external: CARB_EXTERNAL_FLAG || pickAddress(CONTRACTS.carbVotes) !== null,
} as const;

const requireVotingToken = (): Address => {
  if (!CARB.votingToken) {
    throw new Error('CARB is not configured.');
  }
  return CARB.votingToken;
};

export const isAddressSet = (value: string | undefined): value is Address =>
  Boolean(value && pickAddress(value));

export const nowSeconds = (): number => Math.floor(Date.now() / MS_PER_SECOND);

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

interface DurationUnit {
  seconds: number;
  en: string;
  zh: string;
}

const DURATION_UNITS: readonly DurationUnit[] = [
  { seconds: SECONDS_PER_DAY, en: 'd', zh: '天' },
  { seconds: SECONDS_PER_HOUR, en: 'h', zh: '小时' },
  { seconds: SECONDS_PER_MINUTE, en: 'm', zh: '分' },
  { seconds: 1, en: 's', zh: '秒' },
];

const MAX_DURATION_PARTS = 2;

const ZERO_DURATION: Record<Locale, string> = { en: '0s', zh: '0秒' };

/** `3d 4h` / `3天 4小时`: the two largest non-zero units of a duration in seconds. */
export const formatDuration = (
  totalSeconds: number,
  locale: Locale
): string => {
  let remaining = Math.max(0, Math.floor(totalSeconds));
  const parts: string[] = [];
  for (const unit of DURATION_UNITS) {
    if (parts.length === MAX_DURATION_PARTS) {
      break;
    }
    const count = Math.floor(remaining / unit.seconds);
    if (count > 0) {
      parts.push(`${count}${unit[locale]}`);
      remaining -= count * unit.seconds;
    }
  }
  return parts.length > 0 ? parts.join(' ') : ZERO_DURATION[locale];
};

/** Share of a fee waived, in percent, from basis points of the fee (2500 -> 25). */
export const bpsToPercent = (bps: bigint | number): number => Number(bps) / 100;

/**
 * Effective trading fee in basis points after a discount (both in bps): `fee * (10000 - discount) / 10000`,
 * as a float for DISPLAY only (the contract does the exact integer math).
 */
export const discountedFeeBps = (feeBps: bigint, discountBps: bigint): number =>
  Number(feeBps * (BPS_DENOMINATOR - discountBps)) / 10_000;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

const CARB_DISPLAY_FRACTION_DIGITS = 4;

/** CARB amount for DISPLAY (grouped, up to 4 decimals); never feed the result back into math. `decimals` is the token's own. */
export const formatKarb = (
  wei: bigint,
  locale: Locale,
  decimals: number
): string =>
  formatDecimal(
    toDisplayNumber(wei, decimals),
    locale,
    CARB_DISPLAY_FRACTION_DIGITS
  );

export interface TokenInfo {
  symbol: string;
  decimals: number;
  totalSupply: bigint;
}

export const readTokenInfo = async (
  client: PublicClient,
  token: Address
): Promise<TokenInfo> => {
  const [symbol, decimals, totalSupply] = await Promise.all([
    client.readContract({
      address: token,
      abi: ABI_CARB_TOKEN,
      functionName: 'symbol',
    }),
    client.readContract({
      address: token,
      abi: ABI_CARB_TOKEN,
      functionName: 'decimals',
    }),
    client.readContract({
      address: token,
      abi: ABI_CARB_TOKEN,
      functionName: 'totalSupply',
    }),
  ]);
  return { symbol, decimals, totalSupply };
};

export interface TokenAccount {
  /** CARB in the wallet (not staked, not wrapped). */
  balance: bigint;
  /** vCARB in the wallet when governance goes through the CarbVotes wrapper; 0 otherwise. */
  wrapped: bigint;
  /** Address the account delegates its votes to (zero address = nobody). */
  delegate: Address;
  /** Votes currently counted for the account (its own delegation plus others'). */
  votes: bigint;
  /** The voting token answered `delegates` / `getVotes`. False for an external CARB without votes and no wrapper. */
  votesSupported: boolean;
}

interface VotingState {
  delegate: Address;
  votes: bigint;
  supported: boolean;
}

/** Delegate and votes of `account` on the voting token (wrapper, else CARB); tolerant of a token without votes. */
const readVotingState = async (
  client: PublicClient,
  votingToken: Address | null,
  account: Address
): Promise<VotingState> => {
  if (!votingToken) {
    return { delegate: zeroAddress, votes: 0n, supported: false };
  }
  try {
    const [delegate, votes] = await Promise.all([
      client.readContract({
        address: votingToken,
        abi: ABI_CARB_VOTES,
        functionName: 'delegates',
        args: [account],
      }),
      client.readContract({
        address: votingToken,
        abi: ABI_CARB_VOTES,
        functionName: 'getVotes',
        args: [account],
      }),
    ]);
    return { delegate, votes, supported: true };
  } catch {
    return { delegate: zeroAddress, votes: 0n, supported: false };
  }
};

export const readTokenAccount = async (
  client: PublicClient,
  token: Address,
  account: Address
): Promise<TokenAccount> => {
  const [balance, wrapped, voting] = await Promise.all([
    client.readContract({
      address: token,
      abi: ABI_CARB_TOKEN,
      functionName: 'balanceOf',
      args: [account],
    }),
    CARB.votes
      ? client.readContract({
          address: CARB.votes,
          abi: ABI_CARB_VOTES,
          functionName: 'balanceOf',
          args: [account],
        })
      : Promise.resolve(0n),
    readVotingState(client, CARB.votingToken, account),
  ]);
  return {
    balance,
    wrapped,
    delegate: voting.delegate,
    votes: voting.votes,
    votesSupported: voting.supported,
  };
};

export interface TierRow {
  tier: number;
  /** Minimum matured stake in CARB base units (tier 0 has none). */
  threshold: bigint;
  /** Share of the trading fee waived, in basis points of the fee. */
  discountBps: number;
}

export interface StakingParams {
  tiers: TierRow[];
  /** Seconds a new stake takes to count for a tier. */
  warmup: number;
  /** Seconds between `unstake` and `withdraw`. */
  cooldown: number;
  totalStaked: bigint;
}

export const readStakingParams = async (
  client: PublicClient,
  staking: Address
): Promise<StakingParams> => {
  const tierIndexes = Array.from({ length: TIER_COUNT }, (_, index) => index);
  const [warmup, cooldown, totalStaked, discounts, thresholds] =
    await Promise.all([
      client.readContract({
        address: staking,
        abi: ABI_CARB_STAKING,
        functionName: 'WARMUP',
      }),
      client.readContract({
        address: staking,
        abi: ABI_CARB_STAKING,
        functionName: 'COOLDOWN',
      }),
      client.readContract({
        address: staking,
        abi: ABI_CARB_STAKING,
        functionName: 'totalStaked',
      }),
      Promise.all(
        tierIndexes.map((tier) =>
          client.readContract({
            address: staking,
            abi: ABI_CARB_STAKING,
            functionName: 'tierDiscountBps',
            args: [BigInt(tier)],
          })
        )
      ),
      // `tierThresholds` has three entries: the thresholds of tiers 1..3
      Promise.all(
        [0n, 1n, 2n].map((index) =>
          client.readContract({
            address: staking,
            abi: ABI_CARB_STAKING,
            functionName: 'tierThresholds',
            args: [index],
          })
        )
      ),
    ]);
  const tiers: TierRow[] = tierIndexes.map((tier) => ({
    tier,
    threshold: tier === 0 ? 0n : (thresholds[tier - 1] ?? 0n),
    discountBps: Number(discounts[tier] ?? 0),
  }));
  return {
    tiers,
    warmup: Number(warmup),
    cooldown: Number(cooldown),
    totalStaked,
  };
};

export interface StakePosition {
  matured: bigint;
  pending: bigint;
  /** Unix seconds of the latest stake into `pending`. */
  pendingSince: number;
  cooling: bigint;
  /** Unix seconds at which `cooling` becomes withdrawable. */
  unlockAt: number;
  /** Stake counting for the tier right now. */
  effective: bigint;
  tier: number;
  discountBps: number;
}

export const readStakePosition = async (
  client: PublicClient,
  staking: Address,
  account: Address
): Promise<StakePosition> => {
  const [position, effective, tier, discount] = await Promise.all([
    client.readContract({
      address: staking,
      abi: ABI_CARB_STAKING,
      functionName: 'positionOf',
      args: [account],
    }),
    client.readContract({
      address: staking,
      abi: ABI_CARB_STAKING,
      functionName: 'effectiveStake',
      args: [account],
    }),
    client.readContract({
      address: staking,
      abi: ABI_CARB_STAKING,
      functionName: 'tierOf',
      args: [account],
    }),
    client.readContract({
      address: staking,
      abi: ABI_CARB_STAKING,
      functionName: 'discountBps',
      args: [account],
    }),
  ]);
  const [matured, pending, pendingSince, cooling, unlockAt] = position;
  return {
    matured,
    pending,
    pendingSince: Number(pendingSince),
    cooling,
    unlockAt: Number(unlockAt),
    effective,
    tier: Number(tier),
    discountBps: Number(discount),
  };
};

export const readAllowance = (
  client: PublicClient,
  owner: Address,
  spender: Address
): Promise<bigint> => {
  if (!CARB.token) {
    return Promise.resolve(0n);
  }
  return client.readContract({
    address: CARB.token,
    abi: ABI_CARB_TOKEN,
    functionName: 'allowance',
    args: [owner, spender],
  });
};

// ---------------------------------------------------------------------------
// Writes: every call is simulated first so a revert reason surfaces before the wallet prompt
// ---------------------------------------------------------------------------

export interface TxContext {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: Address;
}

export type TxSubmitted = (hash: Hash) => void;

/** Which step of a multi-transaction flow is running. */
export type TxStage = 'approving' | 'sending';

export interface TxCallbacks {
  onSubmitted?: TxSubmitted;
  onStage?: (stage: TxStage) => void;
}

const broadcast = async (
  ctx: TxContext,
  request: unknown,
  onSubmitted?: TxSubmitted
): Promise<TransactionReceipt> => {
  const hash = await writeContractOnTargetChain(ctx.walletClient, request);
  onSubmitted?.(hash);
  const receipt = await ctx.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status === 'reverted') {
    throw new Error('Transaction reverted onchain.');
  }
  return receipt;
};

/** Runs a simulate-then-send step; wallet / revert errors become readable messages. */
const guarded = async (
  ctx: TxContext,
  simulate: () => Promise<{ request: unknown }>,
  onSubmitted?: TxSubmitted
): Promise<TransactionReceipt> => {
  try {
    const { request } = await simulate();
    return await broadcast(ctx, request, onSubmitted);
  } catch (error) {
    throw new Error(registryErrorMessage(error));
  }
};

const requireToken = (): Address => {
  if (!CARB.token) {
    throw new Error('CARB is not configured.');
  }
  return CARB.token;
};

/**
 * Approves exactly `amount` of CARB for `spender` when the current allowance is lower
 * (no unlimited approvals, no permit). Resolves once the approval is mined or was not needed.
 */
export const ensureKarbAllowance = async (
  ctx: TxContext,
  spender: Address,
  amount: bigint,
  { onSubmitted, onStage }: TxCallbacks = {}
): Promise<void> => {
  const token = requireToken();
  const allowance = await readAllowance(ctx.publicClient, ctx.account, spender);
  if (allowance >= amount) {
    return;
  }
  onStage?.('approving');
  await guarded(
    ctx,
    () =>
      ctx.publicClient.simulateContract({
        address: token,
        abi: ABI_CARB_TOKEN,
        functionName: 'approve',
        account: ctx.account,
        args: [spender, amount],
      }),
    onSubmitted
  );
};

const requireStaking = (): Address => {
  if (!CARB.staking) {
    throw new Error('CARB staking is not configured.');
  }
  return CARB.staking;
};

export const sendStake = async (
  ctx: TxContext,
  amount: bigint,
  callbacks: TxCallbacks = {}
): Promise<TransactionReceipt> => {
  const staking = requireStaking();
  try {
    await ensureKarbAllowance(ctx, staking, amount, callbacks);
  } catch (error) {
    throw new Error(registryErrorMessage(error));
  }
  callbacks.onStage?.('sending');
  return await guarded(
    ctx,
    () =>
      ctx.publicClient.simulateContract({
        address: staking,
        abi: ABI_CARB_STAKING,
        functionName: 'stake',
        account: ctx.account,
        args: [amount],
      }),
    callbacks.onSubmitted
  );
};

export const sendUnstake = (
  ctx: TxContext,
  amount: bigint,
  onSubmitted?: TxSubmitted
): Promise<TransactionReceipt> => {
  const staking = requireStaking();
  return guarded(
    ctx,
    () =>
      ctx.publicClient.simulateContract({
        address: staking,
        abi: ABI_CARB_STAKING,
        functionName: 'unstake',
        account: ctx.account,
        args: [amount],
      }),
    onSubmitted
  );
};

export const sendWithdrawStake = (
  ctx: TxContext,
  onSubmitted?: TxSubmitted
): Promise<TransactionReceipt> => {
  const staking = requireStaking();
  return guarded(
    ctx,
    () =>
      ctx.publicClient.simulateContract({
        address: staking,
        abi: ABI_CARB_STAKING,
        functionName: 'withdraw',
        account: ctx.account,
      }),
    onSubmitted
  );
};

/** Delegation lives where the votes are: the CarbVotes wrapper when configured, else the CARB token itself. */
export const sendDelegate = (
  ctx: TxContext,
  delegatee: Address,
  onSubmitted?: TxSubmitted
): Promise<TransactionReceipt> => {
  const votingToken = requireVotingToken();
  return guarded(
    ctx,
    () =>
      ctx.publicClient.simulateContract({
        address: votingToken,
        abi: ABI_CARB_VOTES,
        functionName: 'delegate',
        account: ctx.account,
        args: [delegatee],
      }),
    onSubmitted
  );
};

const requireVotes = (): Address => {
  if (!CARB.votes) {
    throw new Error('The CARB voting wrapper is not configured.');
  }
  return CARB.votes;
};

/**
 * Wraps `amount` CARB 1:1 into voting power (vCARB) for the connected account: approves exactly `amount`
 * when needed, then `depositFor`. The wrapper rejects a token that charges a transfer fee.
 */
export const sendDepositVotes = async (
  ctx: TxContext,
  amount: bigint,
  callbacks: TxCallbacks = {}
): Promise<TransactionReceipt> => {
  const votes = requireVotes();
  try {
    await ensureKarbAllowance(ctx, votes, amount, callbacks);
  } catch (error) {
    throw new Error(registryErrorMessage(error));
  }
  callbacks.onStage?.('sending');
  return await guarded(
    ctx,
    () =>
      ctx.publicClient.simulateContract({
        address: votes,
        abi: ABI_CARB_VOTES,
        functionName: 'depositFor',
        account: ctx.account,
        args: [ctx.account, amount],
      }),
    callbacks.onSubmitted
  );
};

/** Unwraps `amount` vCARB back to CARB in the connected wallet (no lock, no fee). */
export const sendWithdrawVotes = (
  ctx: TxContext,
  amount: bigint,
  onSubmitted?: TxSubmitted
): Promise<TransactionReceipt> => {
  const votes = requireVotes();
  return guarded(
    ctx,
    () =>
      ctx.publicClient.simulateContract({
        address: votes,
        abi: ABI_CARB_VOTES,
        functionName: 'withdrawTo',
        account: ctx.account,
        args: [ctx.account, amount],
      }),
    onSubmitted
  );
};

const requireBond = (): Address => {
  if (!CARB.bond) {
    throw new Error('Issuer bond is not configured.');
  }
  return CARB.bond;
};

export const sendBond = async (
  ctx: TxContext,
  amount: bigint,
  callbacks: TxCallbacks = {}
): Promise<TransactionReceipt> => {
  const bond = requireBond();
  try {
    await ensureKarbAllowance(ctx, bond, amount, callbacks);
  } catch (error) {
    throw new Error(registryErrorMessage(error));
  }
  callbacks.onStage?.('sending');
  return await guarded(
    ctx,
    () =>
      ctx.publicClient.simulateContract({
        address: bond,
        abi: ABI_ISSUER_BOND,
        functionName: 'bond',
        account: ctx.account,
        args: [amount],
      }),
    callbacks.onSubmitted
  );
};

export const sendStartUnbond = (
  ctx: TxContext,
  onSubmitted?: TxSubmitted
): Promise<TransactionReceipt> => {
  const bond = requireBond();
  return guarded(
    ctx,
    () =>
      ctx.publicClient.simulateContract({
        address: bond,
        abi: ABI_ISSUER_BOND,
        functionName: 'startUnbond',
        account: ctx.account,
      }),
    onSubmitted
  );
};

export const sendWithdrawBond = (
  ctx: TxContext,
  onSubmitted?: TxSubmitted
): Promise<TransactionReceipt> => {
  const bond = requireBond();
  return guarded(
    ctx,
    () =>
      ctx.publicClient.simulateContract({
        address: bond,
        abi: ABI_ISSUER_BOND,
        functionName: 'withdraw',
        account: ctx.account,
      }),
    onSubmitted
  );
};

export const sendDisputeSlash = (
  ctx: TxContext,
  id: bigint,
  evidenceHash: Hash,
  onSubmitted?: TxSubmitted
): Promise<TransactionReceipt> => {
  const bond = requireBond();
  return guarded(
    ctx,
    () =>
      ctx.publicClient.simulateContract({
        address: bond,
        abi: ABI_ISSUER_BOND,
        functionName: 'disputeSlash',
        account: ctx.account,
        args: [id, evidenceHash],
      }),
    onSubmitted
  );
};

const requireGovernor = (): Address => {
  if (!CARB.governor) {
    throw new Error('Governor is not configured.');
  }
  return CARB.governor;
};

/** The call set a proposal carries; the description hash is derived from its text. */
export interface ProposalCalls {
  targets: readonly Address[];
  values: readonly bigint[];
  calldatas: readonly `0x${string}`[];
}

export const sendPropose = (
  ctx: TxContext,
  calls: ProposalCalls,
  description: string,
  onSubmitted?: TxSubmitted
): Promise<TransactionReceipt> => {
  const governor = requireGovernor();
  return guarded(
    ctx,
    () =>
      ctx.publicClient.simulateContract({
        address: governor,
        abi: ABI_CARB_GOVERNOR,
        functionName: 'propose',
        account: ctx.account,
        args: [
          [...calls.targets],
          [...calls.values],
          [...calls.calldatas],
          description,
        ],
      }),
    onSubmitted
  );
};

/** Vote support values of `castVote` (GovernorCountingSimple). */
export const VOTE_SUPPORT = { against: 0, for: 1, abstain: 2 } as const;
export type VoteChoice = keyof typeof VOTE_SUPPORT;

export const sendCastVote = (
  ctx: TxContext,
  proposalId: bigint,
  choice: VoteChoice,
  onSubmitted?: TxSubmitted
): Promise<TransactionReceipt> => {
  const governor = requireGovernor();
  return guarded(
    ctx,
    () =>
      ctx.publicClient.simulateContract({
        address: governor,
        abi: ABI_CARB_GOVERNOR,
        functionName: 'castVote',
        account: ctx.account,
        args: [proposalId, VOTE_SUPPORT[choice]],
      }),
    onSubmitted
  );
};

export const sendQueue = (
  ctx: TxContext,
  calls: ProposalCalls,
  descriptionHash: Hash,
  onSubmitted?: TxSubmitted
): Promise<TransactionReceipt> => {
  const governor = requireGovernor();
  return guarded(
    ctx,
    () =>
      ctx.publicClient.simulateContract({
        address: governor,
        abi: ABI_CARB_GOVERNOR,
        functionName: 'queue',
        account: ctx.account,
        args: [
          [...calls.targets],
          [...calls.values],
          [...calls.calldatas],
          descriptionHash,
        ],
      }),
    onSubmitted
  );
};

export const sendExecute = (
  ctx: TxContext,
  calls: ProposalCalls,
  descriptionHash: Hash,
  onSubmitted?: TxSubmitted
): Promise<TransactionReceipt> => {
  const governor = requireGovernor();
  return guarded(
    ctx,
    () =>
      ctx.publicClient.simulateContract({
        address: governor,
        abi: ABI_CARB_GOVERNOR,
        functionName: 'execute',
        account: ctx.account,
        args: [
          [...calls.targets],
          [...calls.values],
          [...calls.calldatas],
          descriptionHash,
        ],
      }),
    onSubmitted
  );
};
