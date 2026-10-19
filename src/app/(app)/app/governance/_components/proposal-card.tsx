'use client';

import type { Address } from 'viem';
import { TxStatus } from '@/components/app/carb-shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useKarbTx, useNowSeconds, useTxRunner } from '@/hooks/use-carb-tx';
import {
  formatDuration,
  formatKarb,
  type ProposalCalls,
  sendCastVote,
  sendExecute,
  sendQueue,
  type VoteChoice,
} from '@/lib/carb';
import { formatAddress } from '@/lib/carb-format';
import { formatChainDate } from '@/lib/chain-format';
import { explorerAddressUrl } from '@/lib/explorer';
import {
  type Locale,
  type TranslateFn,
  useLocaleStore,
  useT,
} from '@/lib/i18n';
import {
  describeCall,
  PROPOSAL_STATE,
  type ProposalView,
  proposalTitle,
  STATE_KEYS,
} from '../_lib/governance-chain';
import { messages } from '../_messages';

interface ProposalCardProps {
  proposal: ProposalView;
  account: Address | undefined;
  symbol: string;
  decimals: number;
}

const BPS_SCALE = 10_000n;
const PERCENT_DIVISOR = 100;

const VOTE_BUTTONS: readonly { choice: VoteChoice; labelKey: string }[] = [
  { choice: 'for', labelKey: 'p.voteFor' },
  { choice: 'against', labelKey: 'p.voteAgainst' },
  { choice: 'abstain', labelKey: 'p.voteAbstain' },
];

const stateTone = (state: number): 'default' | 'secondary' | 'outline' => {
  if (state === PROPOSAL_STATE.active || state === PROPOSAL_STATE.succeeded) {
    return 'default';
  }
  if (state === PROPOSAL_STATE.executed || state === PROPOSAL_STATE.queued) {
    return 'secondary';
  }
  return 'outline';
};

const callsOf = (proposal: ProposalView): ProposalCalls => ({
  targets: proposal.targets,
  values: proposal.values,
  calldatas: proposal.calldatas,
});

const timingText = (
  proposal: ProposalView,
  now: number,
  locale: Locale,
  t: TranslateFn
): string => {
  if (proposal.state === PROPOSAL_STATE.pending) {
    return t('p.opens', { date: formatChainDate(proposal.voteStart, locale) });
  }
  if (proposal.state === PROPOSAL_STATE.active) {
    return t('p.endsIn', {
      time: formatDuration(proposal.voteEnd - now, locale),
      date: formatChainDate(proposal.voteEnd, locale),
    });
  }
  return t('p.ended', { date: formatChainDate(proposal.voteEnd, locale) });
};

const TallyRow = ({
  label,
  value,
  total,
  amount,
}: {
  label: string;
  value: bigint;
  total: bigint;
  amount: string;
}) => {
  const share =
    total === 0n ? 0 : Number((value * BPS_SCALE) / total) / PERCENT_DIVISOR;
  return (
    <div className='space-y-1'>
      <div className='flex justify-between text-xs'>
        <span>{label}</span>
        <span className='font-medium'>
          {amount} ({share.toFixed(1)}%)
        </span>
      </div>
      <div aria-hidden='true' className='h-1.5 w-full bg-muted'>
        <div className='h-full bg-primary' style={{ width: `${share}%` }} />
      </div>
    </div>
  );
};

const Tally = ({
  proposal,
  symbol,
  decimals,
}: Pick<ProposalCardProps, 'proposal' | 'symbol' | 'decimals'>) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);
  const total =
    proposal.forVotes + proposal.againstVotes + proposal.abstainVotes;
  const amount = (wei: bigint) =>
    `${formatKarb(wei, locale, decimals)} ${symbol}`;

  let quorumLine = t('p.quorumLater');
  if (proposal.quorum !== null) {
    const have = proposal.forVotes + proposal.abstainVotes;
    const verdict =
      have >= proposal.quorum ? t('p.quorumReached') : t('p.quorumMissing');
    quorumLine = `${t('p.quorum', {
      have: formatKarb(have, locale, decimals),
      need: formatKarb(proposal.quorum, locale, decimals),
      symbol,
    })} ${verdict}`;
  }

  return (
    <>
      <div className='space-y-2'>
        <TallyRow
          amount={amount(proposal.forVotes)}
          label={t('p.for')}
          total={total}
          value={proposal.forVotes}
        />
        <TallyRow
          amount={amount(proposal.againstVotes)}
          label={t('p.against')}
          total={total}
          value={proposal.againstVotes}
        />
        <TallyRow
          amount={amount(proposal.abstainVotes)}
          label={t('p.abstain')}
          total={total}
          value={proposal.abstainVotes}
        />
      </div>
      <p className='text-muted-foreground text-xs'>{quorumLine}</p>
    </>
  );
};

const VotePanel = ({
  proposal,
  account,
  symbol,
  decimals,
}: ProposalCardProps) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);
  const { ctx, wrongNetwork } = useKarbTx();
  const runner = useTxRunner();

  const open = proposal.state === PROPOSAL_STATE.active;
  const canVote = open && account !== undefined && proposal.hasVoted === false;
  const idle = Boolean(ctx) && !wrongNetwork && !runner.pending;

  const vote = async (choice: VoteChoice) => {
    if (!ctx) {
      return;
    }
    await runner.run(
      (callbacks) =>
        sendCastVote(ctx, proposal.id, choice, callbacks.onSubmitted),
      t('p.voteSuccess')
    );
  };

  if (!(open || proposal.hasVoted)) {
    return null;
  }

  let powerLine: string | null = null;
  if (proposal.myVotes !== null) {
    powerLine =
      proposal.myVotes === 0n
        ? t('p.noPower')
        : t('p.myVotes', {
            amount: formatKarb(proposal.myVotes, locale, decimals),
            symbol,
          });
  }

  return (
    <div className='space-y-2'>
      {powerLine ? <p className='text-xs'>{powerLine}</p> : null}
      {proposal.hasVoted ? (
        <p className='font-medium text-sm'>{t('p.voted')}</p>
      ) : null}
      {open && !account ? (
        <p className='text-muted-foreground text-sm'>{t('p.connect')}</p>
      ) : null}
      {canVote ? (
        <div className='flex flex-wrap gap-2'>
          {VOTE_BUTTONS.map(({ choice, labelKey }) => (
            <Button
              disabled={!idle}
              key={choice}
              onClick={() => vote(choice)}
              type='button'
              variant={choice === 'for' ? 'default' : 'outline'}
            >
              {runner.pending ? t('p.voting') : t(labelKey)}
            </Button>
          ))}
        </div>
      ) : null}
      <TxStatus
        error={runner.error}
        hash={runner.hash}
        wrongNetwork={wrongNetwork}
      />
    </div>
  );
};

const TimelockPanel = ({ proposal }: { proposal: ProposalView }) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);
  const now = useNowSeconds();
  const { ctx, wrongNetwork } = useKarbTx();
  const runner = useTxRunner();

  const succeeded = proposal.state === PROPOSAL_STATE.succeeded;
  const queued = proposal.state === PROPOSAL_STATE.queued;
  const ready = queued && now >= proposal.eta;
  const idle = Boolean(ctx) && !wrongNetwork && !runner.pending;

  const run = async (step: 'queue' | 'execute') => {
    if (!ctx) {
      return;
    }
    const calls = callsOf(proposal);
    await runner.run(
      (callbacks) =>
        step === 'queue'
          ? sendQueue(
              ctx,
              calls,
              proposal.descriptionHash,
              callbacks.onSubmitted
            )
          : sendExecute(
              ctx,
              calls,
              proposal.descriptionHash,
              callbacks.onSubmitted
            ),
      t(step === 'queue' ? 'p.queueSuccess' : 'p.executeSuccess')
    );
  };

  if (!(succeeded || queued)) {
    return null;
  }

  const queuedText = ready
    ? t('p.queuedReady')
    : t('p.queuedWait', {
        time: formatDuration(proposal.eta - now, locale),
        date: formatChainDate(proposal.eta, locale),
      });

  return (
    <div className='space-y-2'>
      <p className='text-sm'>{succeeded ? t('p.queueHint') : queuedText}</p>
      <Button
        disabled={!(idle && (succeeded || ready))}
        onClick={() => run(succeeded ? 'queue' : 'execute')}
        type='button'
      >
        {succeeded ? t('p.queue') : t('p.execute')}
      </Button>
      <TxStatus
        error={runner.error}
        hash={runner.hash}
        wrongNetwork={wrongNetwork}
      />
    </div>
  );
};

const Details = ({ proposal }: { proposal: ProposalView }) => {
  const t = useT(messages);
  return (
    <details className='text-xs'>
      <summary className='cursor-pointer font-medium'>
        {t('p.calls', { count: proposal.targets.length })}
      </summary>
      <ul className='mt-2 space-y-2'>
        {proposal.targets.map((target, index) => (
          <li
            className='break-all font-mono'
            key={`${target}-${proposal.calldatas[index]}`}
          >
            {formatAddress(target, 6)}.
            {describeCall(proposal.calldatas[index] ?? '0x')}
          </li>
        ))}
      </ul>
      <p className='mt-3 font-medium'>{t('p.description')}</p>
      <p className='mt-1 whitespace-pre-wrap text-muted-foreground'>
        {proposal.description}
      </p>
      <p className='mt-3 break-all text-muted-foreground'>
        {t('p.id')}: <span className='font-mono'>{proposal.id.toString()}</span>
      </p>
    </details>
  );
};

export const ProposalCard = ({
  proposal,
  account,
  symbol,
  decimals,
}: ProposalCardProps) => {
  const t = useT(messages);
  const locale = useLocaleStore((state) => state.locale);
  const now = useNowSeconds();

  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader className='space-y-2'>
        <div className='flex flex-wrap items-start justify-between gap-2'>
          <CardTitle className='min-w-0 text-base'>
            {proposalTitle(proposal.description, t('p.untitled'))}
          </CardTitle>
          <Badge className='rounded-none' variant={stateTone(proposal.state)}>
            {t(STATE_KEYS[proposal.state] ?? 'state.pending')}
          </Badge>
        </div>
        <p className='text-muted-foreground text-xs'>
          {t('p.proposer')}{' '}
          <a
            className='font-mono underline'
            href={explorerAddressUrl(proposal.proposer)}
            rel='noopener noreferrer'
            target='_blank'
          >
            {formatAddress(proposal.proposer)}
          </a>
          {' · '}
          {timingText(proposal, now, locale, t)}
        </p>
      </CardHeader>
      <CardContent className='space-y-4'>
        <Tally decimals={decimals} proposal={proposal} symbol={symbol} />
        <VotePanel
          account={account}
          decimals={decimals}
          proposal={proposal}
          symbol={symbol}
        />
        <TimelockPanel proposal={proposal} />
        <Details proposal={proposal} />
      </CardContent>
    </Card>
  );
};
