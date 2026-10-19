import type { Address } from 'viem';
import type { TxContext } from '@/lib/carb';
import {
  type BuiltCall,
  fillTemplate,
  isGovernedTarget,
  type Message,
} from './proposal-actions';
import { readTargetAllowed } from './use-governance-data';

const PROPOSED_VIA = 'Proposed through the Carbonized app.';

/** Onchain description: the title, the English plain-language summary and a provenance line. */
export const buildDescription = (
  title: string,
  englishTemplate: string | undefined,
  summary: Message
): string =>
  [title, fillTemplate(englishTemplate ?? '', summary.vars), PROPOSED_VIA].join(
    '\n\n'
  );

export interface ProposalBlockers {
  /** Shown when the target is not on the allowlist. */
  blocked: string;
  /** Shown when a provider address has no contract code. */
  noCode: string;
}

/**
 * Last checks before a proposal is sent. The form only knows three protocol contracts, and the governor
 * must also list the target; a provider address must hold code or the change would fail on execution.
 */
export const assertProposable = async (
  ctx: TxContext,
  governor: Address,
  target: Address,
  call: BuiltCall,
  blockers: ProposalBlockers
): Promise<void> => {
  const allowed =
    isGovernedTarget(target) &&
    (await readTargetAllowed(ctx.publicClient, governor, target));
  if (!allowed) {
    throw new Error(blockers.blocked);
  }
  if (call.requiresCode) {
    const code = await ctx.publicClient.getCode({ address: call.requiresCode });
    if (!code || code === '0x') {
      throw new Error(blockers.noCode);
    }
  }
};
