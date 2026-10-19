import {
  type Address,
  decodeFunctionData,
  type Hash,
  type Hex,
  keccak256,
  type PublicClient,
  toBytes,
  zeroAddress,
} from 'viem';
import {
  ABI_CARB_GOVERNOR,
  ABI_CARB_STAKING,
  ABI_ISSUER_BOND,
  ABI_MARKETPLACE_PARAMS,
} from '@/config/contracts';
import { getLogsClient } from '@/lib/logs-client';
import { resolveFromBlock, scanCoversDeployment } from '@/lib/onchain-events';
import { collectChunked } from '@/lib/registry';

/** OpenZeppelin `IGovernor.ProposalState`. */
export const PROPOSAL_STATE = {
  pending: 0,
  active: 1,
  canceled: 2,
  defeated: 3,
  succeeded: 4,
  queued: 5,
  expired: 6,
  executed: 7,
} as const;

export const STATE_KEYS: Record<number, string> = {
  0: 'state.pending',
  1: 'state.active',
  2: 'state.canceled',
  3: 'state.defeated',
  4: 'state.succeeded',
  5: 'state.queued',
  6: 'state.expired',
  7: 'state.executed',
};

const PROPOSAL_LIMIT = 25;
const READ_BATCH = 5;

export interface GovernorSettings {
  /** Seconds between a proposal and the start of voting. */
  votingDelay: number;
  /** Seconds voting stays open. */
  votingPeriod: number;
  /** Delegated CARB needed to propose, in base units. */
  proposalThreshold: bigint;
  /** Quorum as a percent of the total supply at the snapshot. */
  quorumPercent: number;
}

export interface ProposalView {
  id: bigint;
  proposer: Address;
  targets: Address[];
  values: bigint[];
  calldatas: Hex[];
  description: string;
  descriptionHash: Hash;
  /** Unix seconds: voting opens (the vote snapshot). */
  voteStart: number;
  /** Unix seconds: voting closes. */
  voteEnd: number;
  state: number;
  againstVotes: bigint;
  forVotes: bigint;
  abstainVotes: bigint;
  /** Votes needed (for + abstain); null while the snapshot is still in the future. */
  quorum: bigint | null;
  /** Unix seconds the timelock operation becomes executable; 0 when not queued. */
  eta: number;
  /** Null when no wallet is connected. */
  hasVoted: boolean | null;
  /** Wallet's voting power at the proposal snapshot; null when unknown. */
  myVotes: bigint | null;
}

export interface GovernanceSnapshot {
  proposals: ProposalView[];
  /** False when only the recent blocks were scanned (set NEXT_PUBLIC_DEPLOY_BLOCK to scan everything). */
  fullHistory: boolean;
  /** Proposals found before the display limit. */
  total: number;
}

export const descriptionHashOf = (description: string): Hash =>
  keccak256(toBytes(description));

export const readGovernorSettings = async (
  client: PublicClient,
  governor: Address
): Promise<GovernorSettings> => {
  const [votingDelay, votingPeriod, proposalThreshold, numerator, denominator] =
    await Promise.all([
      client.readContract({
        address: governor,
        abi: ABI_CARB_GOVERNOR,
        functionName: 'votingDelay',
      }),
      client.readContract({
        address: governor,
        abi: ABI_CARB_GOVERNOR,
        functionName: 'votingPeriod',
      }),
      client.readContract({
        address: governor,
        abi: ABI_CARB_GOVERNOR,
        functionName: 'proposalThreshold',
      }),
      client.readContract({
        address: governor,
        abi: ABI_CARB_GOVERNOR,
        functionName: 'quorumNumerator',
      }),
      client.readContract({
        address: governor,
        abi: ABI_CARB_GOVERNOR,
        functionName: 'quorumDenominator',
      }),
    ]);
  return {
    votingDelay: Number(votingDelay),
    votingPeriod: Number(votingPeriod),
    proposalThreshold,
    quorumPercent: Number((numerator * 100n) / denominator),
  };
};

/** `getVotes` / `quorum` revert for timepoints that are not in the past yet; treat that as unknown. */
const readOrNull = async <T>(read: () => Promise<T>): Promise<T | null> => {
  try {
    return await read();
  } catch {
    return null;
  }
};

interface CreatedLog {
  proposalId: bigint;
  proposer: Address;
  targets: readonly Address[];
  values: readonly bigint[];
  calldatas: readonly Hex[];
  voteStart: bigint;
  voteEnd: bigint;
  description: string;
}

const readProposal = async (
  client: PublicClient,
  governor: Address,
  created: CreatedLog,
  account: Address | undefined
): Promise<ProposalView> => {
  const id = created.proposalId;
  const voteStart = Number(created.voteStart);
  const [state, votes] = await Promise.all([
    client.readContract({
      address: governor,
      abi: ABI_CARB_GOVERNOR,
      functionName: 'state',
      args: [id],
    }),
    client.readContract({
      address: governor,
      abi: ABI_CARB_GOVERNOR,
      functionName: 'proposalVotes',
      args: [id],
    }),
  ]);
  const snapshotPast = state !== PROPOSAL_STATE.pending;
  const [quorum, eta, hasVoted, myVotes] = await Promise.all([
    snapshotPast
      ? readOrNull(() =>
          client.readContract({
            address: governor,
            abi: ABI_CARB_GOVERNOR,
            functionName: 'quorum',
            args: [created.voteStart],
          })
        )
      : Promise.resolve(null),
    state === PROPOSAL_STATE.queued
      ? readOrNull(() =>
          client.readContract({
            address: governor,
            abi: ABI_CARB_GOVERNOR,
            functionName: 'proposalEta',
            args: [id],
          })
        )
      : Promise.resolve(null),
    account
      ? readOrNull(() =>
          client.readContract({
            address: governor,
            abi: ABI_CARB_GOVERNOR,
            functionName: 'hasVoted',
            args: [id, account],
          })
        )
      : Promise.resolve(null),
    account && snapshotPast
      ? readOrNull(() =>
          client.readContract({
            address: governor,
            abi: ABI_CARB_GOVERNOR,
            functionName: 'getVotes',
            args: [account, created.voteStart],
          })
        )
      : Promise.resolve(null),
  ]);
  const [againstVotes, forVotes, abstainVotes] = votes;
  return {
    id,
    proposer: created.proposer,
    targets: [...created.targets],
    values: [...created.values],
    calldatas: [...created.calldatas],
    description: created.description,
    descriptionHash: descriptionHashOf(created.description),
    voteStart,
    voteEnd: Number(created.voteEnd),
    state,
    againstVotes,
    forVotes,
    abstainVotes,
    quorum,
    eta: Number(eta ?? 0n),
    hasVoted,
    myVotes,
  };
};

/** Newest proposals from `ProposalCreated` events, each enriched with its state, tally and quorum. */
export const fetchGovernance = async (
  client: PublicClient,
  governor: Address,
  account: Address | undefined
): Promise<GovernanceSnapshot> => {
  const latest = await client.getBlockNumber();
  const from = resolveFromBlock(latest);
  const logs = await collectChunked(from, latest, (start, end) =>
    getLogsClient(client).getContractEvents({
      address: governor,
      abi: ABI_CARB_GOVERNOR,
      eventName: 'ProposalCreated',
      fromBlock: start,
      toBlock: end,
    })
  );
  const newest = [...logs]
    .sort((a, b) =>
      a.blockNumber === b.blockNumber
        ? b.logIndex - a.logIndex
        : Number(b.blockNumber - a.blockNumber)
    )
    .slice(0, PROPOSAL_LIMIT);

  const proposals: ProposalView[] = [];
  for (let index = 0; index < newest.length; index += READ_BATCH) {
    const batch = newest.slice(index, index + READ_BATCH);
    const views = await Promise.all(
      batch.map((log) =>
        readProposal(
          client,
          governor,
          {
            proposalId: log.args.proposalId ?? 0n,
            proposer: log.args.proposer ?? zeroAddress,
            targets: log.args.targets ?? [],
            values: log.args.values ?? [],
            calldatas: log.args.calldatas ?? [],
            voteStart: log.args.voteStart ?? 0n,
            voteEnd: log.args.voteEnd ?? 0n,
            description: log.args.description ?? '',
          },
          account
        )
      )
    );
    proposals.push(...views);
  }
  return {
    proposals,
    fullHistory: scanCoversDeployment(from),
    total: logs.length,
  };
};

const DECODE_ABI = [
  ...ABI_MARKETPLACE_PARAMS,
  ...ABI_CARB_STAKING,
  ...ABI_ISSUER_BOND,
  ...ABI_CARB_GOVERNOR,
] as const;

/** `functionName(arg1, arg2)` for a proposal call, or the raw selector when it is not a known function. */
export const describeCall = (data: Hex): string => {
  try {
    const decoded = decodeFunctionData({ abi: DECODE_ABI, data });
    const args = (decoded.args ?? []).map((arg) =>
      Array.isArray(arg) ? `[${arg.map(String).join(', ')}]` : String(arg)
    );
    return `${decoded.functionName}(${args.join(', ')})`;
  } catch {
    return data.slice(0, 10);
  }
};

/** First non-empty line of a proposal description, used as its title. */
export const proposalTitle = (
  description: string,
  fallback: string
): string => {
  const first = description
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return first ?? fallback;
};
