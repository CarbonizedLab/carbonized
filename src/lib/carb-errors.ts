import type { Messages } from '@/lib/i18n';

/**
 * Plain-language versions of the revert reasons raised by the CARB contracts (and the OpenZeppelin
 * code they inherit). Unknown reasons are shown verbatim.
 */
export const carbErrorMessages: Messages = {
  en: {
    'revert.Transaction was rejected in your wallet.':
      'You rejected the transaction in your wallet.',
    'revert.Transaction reverted onchain.':
      'The transaction was mined but reverted onchain.',
    'revert.Invalid amount': 'Enter an amount greater than zero.',
    'revert.Amount too large': 'That amount is too large.',
    'revert.Insufficient stake':
      'You are trying to unstake more than you have staked.',
    'revert.Nothing to withdraw': 'Nothing is ready to withdraw yet.',
    'revert.Cooldown active':
      'The cooldown is still running; wait until it ends.',
    'revert.Bond path closed':
      'The bond path is closed: new bonding is not accepted right now.',
    'revert.Issuer blocked': 'This address is barred from the bond path.',
    'revert.Unbonding': 'Your bond is unbonding; it cannot be topped up.',
    'revert.Below minimum bond': 'The bond would stay below the minimum bond.',
    'revert.No bond': 'There is no bond for this address.',
    'revert.Already unbonding': 'Unbonding has already started.',
    'revert.Slash pending':
      'A slash proposal is pending: unbonding and withdrawing are frozen until it is resolved.',
    'revert.Not unbonding': 'Start unbonding first.',
    'revert.Unbonding delay active':
      'The unbonding delay is still running; wait until it ends.',
    'revert.Not the slashed issuer':
      'Only the issuer named in the proposal can dispute it.',
    'revert.Proposal not active':
      'That slash proposal is no longer active (resolved or lapsed).',
    'revert.Already disputed': 'That proposal was already disputed.',
    'revert.ERC20: transfer amount exceeds balance':
      'Your CARB balance is too low.',
    'revert.ERC20: insufficient allowance':
      'The CARB allowance is too low; approve first.',
    'revert.Received amount differs (fee-on-transfer unsupported)':
      'This token takes a fee (or changes balances) on transfer. The contracts only accept exactly the amount sent, so the transaction was refused.',
    'revert.ERC20: burn amount exceeds balance':
      'You do not have that much in the voting wrapper.',
    'revert.Target not allowed':
      'That contract is not on the governor allowlist.',
    'revert.ETH value not allowed': 'Proposals cannot carry ETH.',
    'revert.Governor: proposer votes below proposal threshold':
      'Your delegated votes are below the proposal threshold.',
    'revert.Governor: vote not currently active':
      'Voting is not open for this proposal.',
    'revert.GovernorVotingSimple: vote already cast':
      'You have already voted on this proposal.',
    'revert.Governor: proposal not successful':
      'The proposal has not succeeded (yet).',
    'revert.Governor: proposal already exists':
      'An identical proposal already exists.',
    'revert.TimelockController: operation is not ready':
      'The timelock delay has not elapsed yet.',
  },
  zh: {
    'revert.Transaction was rejected in your wallet.':
      '您在钱包中拒绝了该交易。',
    'revert.Transaction reverted onchain.': '交易已上链，但执行被回滚。',
    'revert.Invalid amount': '请输入大于零的数量。',
    'revert.Amount too large': '数量过大。',
    'revert.Insufficient stake': '您尝试解除质押的数量超过了已质押数量。',
    'revert.Nothing to withdraw': '暂时没有可提取的代币。',
    'revert.Cooldown active': '冷却期尚未结束，请等待。',
    'revert.Bond path closed': '保证金通道已关闭：目前不接受新的保证金。',
    'revert.Issuer blocked': '该地址被禁止使用保证金通道。',
    'revert.Unbonding': '您的保证金正在解锁，无法追加。',
    'revert.Below minimum bond': '保证金将低于最低要求。',
    'revert.No bond': '该地址没有保证金。',
    'revert.Already unbonding': '已经开始解锁。',
    'revert.Slash pending':
      '存在待处理的罚没提案：在其处理完毕前，无法开始解锁或提取。',
    'revert.Not unbonding': '请先开始解锁。',
    'revert.Unbonding delay active': '解锁等待期尚未结束，请等待。',
    'revert.Not the slashed issuer': '只有提案中指明的签发方才能提出异议。',
    'revert.Proposal not active': '该罚没提案已不再有效（已处理或已过期）。',
    'revert.Already disputed': '该提案已被提出异议。',
    'revert.ERC20: transfer amount exceeds balance': '您的 CARB 余额不足。',
    'revert.ERC20: insufficient allowance': 'CARB 授权额度不足，请先授权。',
    'revert.Received amount differs (fee-on-transfer unsupported)':
      '该代币在转账时收取了费用（或余额发生了变化），合约只接受恰好到账的数量，因此交易被拒绝。',
    'revert.ERC20: burn amount exceeds balance': '您在投票封装中的余额不足。',
    'revert.Target not allowed': '该合约不在治理合约的允许列表中。',
    'revert.ETH value not allowed': '提案不能携带 ETH。',
    'revert.Governor: proposer votes below proposal threshold':
      '您已委托的票数低于提案门槛。',
    'revert.Governor: vote not currently active': '该提案当前不在投票期。',
    'revert.GovernorVotingSimple: vote already cast': '您已对该提案投过票。',
    'revert.Governor: proposal not successful': '该提案尚未通过。',
    'revert.Governor: proposal already exists': '已存在相同的提案。',
    'revert.TimelockController: operation is not ready': '时间锁延迟尚未结束。',
  },
};
