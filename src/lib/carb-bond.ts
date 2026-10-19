import { type Address, type PublicClient, zeroAddress } from 'viem';
import { ABI_ISSUER_BOND } from '@/config/contracts';
import { getLogsClient } from '@/lib/logs-client';
import { resolveFromBlock } from '@/lib/onchain-events';
import { collectChunked } from '@/lib/registry';

export interface BondPosition {
  /** CARB locked, in base units. */
  amount: bigint;
  /** Unix seconds when the bond becomes withdrawable (only meaningful while unbonding). */
  releaseAt: number;
  unbonding: boolean;
  /** `IssuerBond` granted the issuer role for this bond (so it will revoke it on unbonding). */
  roleViaBond: boolean;
}

export interface SlashInfo {
  id: bigint;
  /** Proposed slash amount in CARB base units (capped to the bond when executed). */
  amount: bigint;
  /** Unix seconds: the dispute window ends and the slash becomes executable. */
  executableAt: number;
  /** Unix seconds: the proposal lapses if still unexecuted. */
  expiresAt: number;
  disputed: boolean;
  reason: string;
}

/** Configured destinations of slashed tokens. */
export interface SlashDestination {
  /** `slashTreasury`: when set, slashed CARB is sent here (no burn). */
  treasury: Address | null;
  /** `slashSink`: where slashed CARB goes when the token cannot be burned (null on a bond without a sink). */
  sink: Address | null;
}

/** What an executed slash really did, from the `Slashed` event. */
export interface SlashOutcome {
  id: bigint;
  amount: bigint;
  /** Burned through the token's `burn`. */
  burned: boolean;
  /** Where the tokens went when they were not burned (treasury or sink); null when burned. */
  sink: Address | null;
}

export interface BondState {
  position: BondPosition;
  minBond: bigint;
  /** The bond path accepts new bonding. */
  pathOpen: boolean;
  /** The address is barred from the bond path by the admin. */
  blocked: boolean;
  /** Seconds a bond stays locked after unbonding starts. */
  unbondDelay: number;
  /** Seconds a slash proposal waits before it can be executed. */
  disputeWindow: number;
  /** Unresolved, unlapsed slash proposal against the account, if any. */
  slash: SlashInfo | null;
  /** Where tokens go when a slash executes (configured treasury, else burn if possible, else the sink). */
  destination: SlashDestination;
  /** Latest executed slash against the account, with its actual outcome. */
  lastSlash: SlashOutcome | null;
}

const readSlashReason = async (
  client: PublicClient,
  bond: Address,
  id: bigint
): Promise<string> => {
  const latest = await client.getBlockNumber();
  const logs = await collectChunked(
    resolveFromBlock(latest),
    latest,
    (start, end) =>
      getLogsClient(client).getContractEvents({
        address: bond,
        abi: ABI_ISSUER_BOND,
        eventName: 'SlashProposed',
        args: { id },
        fromBlock: start,
        toBlock: end,
      })
  );
  return logs.at(-1)?.args.reason ?? '';
};

/** Where an executed slash sends the tokens; `treasury` wins over burning, which wins over `sink`. */
const readSlashDestination = async (
  client: PublicClient,
  bond: Address
): Promise<SlashDestination> => {
  const [treasury, sink] = await Promise.all([
    client.readContract({
      address: bond,
      abi: ABI_ISSUER_BOND,
      functionName: 'slashTreasury',
    }),
    // Bonds deployed before the slash sink existed have no `slashSink()`.
    client
      .readContract({
        address: bond,
        abi: ABI_ISSUER_BOND,
        functionName: 'slashSink',
      })
      .catch(() => zeroAddress),
  ]);
  return {
    treasury: treasury === zeroAddress ? null : treasury,
    sink: sink === zeroAddress ? null : sink,
  };
};

/** The latest executed slash of `account` (the `Slashed` event records the real outcome: burned or the sink). */
const readLastSlash = async (
  client: PublicClient,
  bond: Address,
  account: Address
): Promise<SlashOutcome | null> => {
  const latest = await client.getBlockNumber();
  const logs = await collectChunked(
    resolveFromBlock(latest),
    latest,
    (start, end) =>
      getLogsClient(client).getContractEvents({
        address: bond,
        abi: ABI_ISSUER_BOND,
        eventName: 'Slashed',
        args: { issuer: account },
        fromBlock: start,
        toBlock: end,
      })
  );
  const last = logs.at(-1);
  if (!last) {
    return null;
  }
  const { id, amount, sink, burned } = last.args;
  if (id === undefined || amount === undefined || burned === undefined) {
    return null;
  }
  return {
    id,
    amount,
    burned,
    sink: !sink || sink === zeroAddress ? null : sink,
  };
};

const readActiveSlash = async (
  client: PublicClient,
  bond: Address,
  account: Address,
  nowSec: number
): Promise<SlashInfo | null> => {
  const id = await client.readContract({
    address: bond,
    abi: ABI_ISSUER_BOND,
    functionName: 'activeSlashOf',
    args: [account],
  });
  if (id === 0n) {
    return null;
  }
  const [, amount, executableAt, expiresAt, disputed, resolved] =
    await client.readContract({
      address: bond,
      abi: ABI_ISSUER_BOND,
      functionName: 'slashProposals',
      args: [id],
    });
  if (resolved || nowSec > Number(expiresAt)) {
    return null;
  }
  const reason = await readSlashReason(client, bond, id).catch(() => '');
  return {
    id,
    amount,
    executableAt: Number(executableAt),
    expiresAt: Number(expiresAt),
    disputed,
    reason,
  };
};

export const readBondState = async (
  client: PublicClient,
  bond: Address,
  account: Address,
  nowSec: number
): Promise<BondState> => {
  const [position, minBond, pathOpen, blocked, unbondDelay, disputeWindow] =
    await Promise.all([
      client.readContract({
        address: bond,
        abi: ABI_ISSUER_BOND,
        functionName: 'bonds',
        args: [account],
      }),
      client.readContract({
        address: bond,
        abi: ABI_ISSUER_BOND,
        functionName: 'minBond',
      }),
      client.readContract({
        address: bond,
        abi: ABI_ISSUER_BOND,
        functionName: 'bondRequired',
      }),
      client.readContract({
        address: bond,
        abi: ABI_ISSUER_BOND,
        functionName: 'blocked',
        args: [account],
      }),
      client.readContract({
        address: bond,
        abi: ABI_ISSUER_BOND,
        functionName: 'UNBOND_DELAY',
      }),
      client.readContract({
        address: bond,
        abi: ABI_ISSUER_BOND,
        functionName: 'DISPUTE_WINDOW',
      }),
    ]);
  const [slash, destination, lastSlash] = await Promise.all([
    readActiveSlash(client, bond, account, nowSec),
    readSlashDestination(client, bond),
    readLastSlash(client, bond, account).catch(() => null),
  ]);
  const [amount, releaseAt, unbonding, roleViaBond] = position;
  return {
    position: { amount, releaseAt: Number(releaseAt), unbonding, roleViaBond },
    minBond,
    pathOpen,
    blocked,
    unbondDelay: Number(unbondDelay),
    disputeWindow: Number(disputeWindow),
    slash,
    destination,
    lastSlash,
  };
};
