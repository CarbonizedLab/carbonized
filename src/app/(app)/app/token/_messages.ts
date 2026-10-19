import type { Messages } from '@/lib/i18n';

export const messages: Messages = {
  en: {
    'page.title': 'CARB token',
    'page.description':
      'CARB is a utility token for optional fee tiers, the issuer bond and parameter governance. It pays no rewards and promises no returns.',
    'page.docs': 'Docs',

    'stat.supply': 'Total supply',
    'stat.supplyNote': 'Total supply as reported by the token contract',
    'stat.balance': 'Your balance',
    'stat.balanceNote': 'CARB in your wallet (not staked)',
    'stat.tier': 'Your fee tier',
    'stat.tierValue': 'Tier {tier}',
    'stat.tierNote': '{percent}% off the trading fee you pay as a seller',
    'stat.staked': 'Staked',
    'stat.stakedNote': 'Counting for your tier or still warming up',
    'stat.connect': 'Connect a wallet',
    'stat.connectNote': 'Connect a wallet to see your position.',
    'stat.loading': 'Loading…',
    'stat.unavailable': '—',

    'pos.title': 'Your stake',
    'pos.description':
      'Only warmed-up stake counts for a tier. New stake warms up first; unstaked CARB cools down before you can withdraw it.',
    'pos.counting': 'Counting for your tier',
    'pos.warming': 'Warming up',
    'pos.warmingNote': 'Counts for your tier in {time} ({date}).',
    'pos.cooling': 'Cooling down',
    'pos.coolingNote': 'Withdrawable in {time} ({date}).',
    'pos.coolingReady': 'Ready to withdraw.',
    'pos.none': 'You have nothing staked or cooling down.',
    'pos.nextTier':
      'Next tier ({tier}) at {amount} {symbol} of counting stake: {missing} {symbol} to go.',
    'pos.topTier': 'You are on the highest tier.',
    'pos.noVotes':
      'Staked and cooling CARB carries no votes. Keep some CARB in your wallet and delegate it if you want to vote.',

    'tiers.title': 'Tiers and fee discounts',
    'tiers.description':
      'Read from the staking contract. A discount lowers the trading fee you pay as the seller of credits (order-book and auction sales). It never changes prices, and it does not apply to AMM swaps.',
    'tiers.tier': 'Tier',
    'tiers.threshold': 'Minimum counting stake',
    'tiers.discount': 'Discount on the fee',
    'tiers.you': 'You',
    'tiers.none': 'No stake needed',
    'tiers.failed': 'Tier settings could not be read.',

    'act.title': 'Stake, unstake, withdraw',
    'act.description':
      'Amounts use the token’s own decimals exactly. Nothing leaves your wallet except what you confirm.',
    'act.stake': 'Stake',
    'act.unstake': 'Unstake',
    'act.withdraw': 'Withdraw',
    'act.amount': 'Amount ({symbol})',
    'act.max': 'Max',
    'act.connect': 'Connect a wallet to stake.',
    'act.sending': 'Confirm in your wallet…',
    'act.balanceHint': 'Wallet balance: {amount} {symbol}',
    'act.stakedHint': 'Staked (counting or warming up): {amount} {symbol}',

    'stake.hint':
      'New stake counts for your tier after the {warmup} warm-up. Staked CARB has no voting power. If the allowance is too low you first approve exactly this amount, then stake (two wallet confirmations).',
    'stake.step.approving':
      'Step 1 of 2: approve {amount} {symbol} for staking',
    'stake.step.sending': 'Step 2 of 2: stake',
    'stake.success': 'Stake confirmed.',

    'unstake.hint':
      'Unstaking stops counting for your tier immediately. The CARB is withdrawable after the {cooldown} cooldown, and unstaking again restarts the cooldown for everything that is cooling.',
    'unstake.success': 'Unstake started. Withdraw after the cooldown.',

    'withdraw.hint':
      'Withdraws every CARB whose cooldown has finished back to your wallet.',
    'withdraw.none': 'Nothing is cooling down.',
    'withdraw.wait': '{amount} {symbol} withdrawable in {time}.',
    'withdraw.ready': '{amount} {symbol} ready to withdraw.',
    'withdraw.success': 'Withdrawn to your wallet.',

    'err.amount':
      'Enter an amount greater than zero (up to {decimals} decimals).',
    'err.exceedsBalance': 'That is more than your wallet balance.',
    'err.exceedsStaked': 'That is more than you have staked.',

    'utility.title': 'What CARB is for',
    'utility.fees':
      'Fee tiers: stake CARB to reach a tier and pay a lower marketplace fee when you sell (a discount of up to half of the fee, never on the price).',
    'utility.bond':
      'Issuer bond: lock CARB to use the bond-based path to the issuer role. The bond can be slashed through a process with a dispute window.',
    'utility.governance':
      'Governance: vote on bounded protocol parameters. Voting needs delegation, and staked or bonded CARB does not vote.',
    'utility.not':
      'CARB does not pay rewards, share revenue or promise returns, and it gives no control over credit issuance or user funds.',
    'utility.docs': 'Read the CARB docs',
    'utility.governanceLink': 'Open governance',

    'staking.missing':
      'The staking contract is not configured on this deployment, so tiers and staking are unavailable.',
    'read.failed': 'Could not read CARB data from the chain. Try again later.',

    'ext.title': 'External token',
    'ext.body':
      '{symbol} is a token launched outside Carbonized (for example through a launchpad). Carbonized only reads and uses it: it does not control its supply, ownership, liquidity or any fee the token may charge. Staking, bonding and the voting wrapper revert if the token takes a fee on transfer.',
    'ext.symbol': 'Symbol',
    'ext.decimals': 'Decimals',
    'ext.address': 'Contract',
    'ext.explorer': 'View on the explorer',
    'ext.risk':
      'Check the token yourself before using it: mint authority, owner powers, liquidity lock, pause or blacklist functions.',

    'vp.title': 'Voting power',
    'vp.descriptionWrapper':
      'Governance needs {symbol} deposited into the voting wrapper (v{symbol}: 1:1, no lock, no fee, withdraw any time) and delegated. Delegated votes count from the next second.',
    'vp.descriptionNative':
      'Votes come from the {symbol} in your wallet once delegated. Delegate on the governance page.',
    'vp.wallet': '{symbol} in your wallet',
    'vp.wrapped': 'Deposited in the wrapper (v{symbol})',
    'vp.delegate': 'Delegated to',
    'vp.self': 'Yourself',
    'vp.none': 'Nobody yet: no voting power',
    'vp.votes': 'Votes you hold now',
    'vp.connect': 'Connect a wallet to see and manage your voting power.',
    'vp.unsupported':
      'This token has no voting functions and no voting wrapper is configured, so governance voting is unavailable on this deployment.',
    'vp.amountHint':
      'Wallet: {balance} {symbol}; in the wrapper: {wrapped} v{symbol}',
    'vp.deposit': 'Deposit',
    'vp.withdraw': 'Withdraw',
    'vp.step.approving':
      'Step 1 of 2: approve {amount} {symbol} for the voting wrapper',
    'vp.step.sending': 'Step 2 of 2: deposit',
    'vp.depositSuccess':
      'Deposited into the voting wrapper. Now delegate (to yourself is enough).',
    'vp.withdrawSuccess': 'Withdrawn to your wallet.',
    'vp.delegateSuccess': 'Delegation updated.',
    'vp.delegateSelf': 'Delegate to myself',
    'vp.delegateNote':
      'Votes only count once delegated (to yourself is enough). You can delegate to another address on the governance page.',
    'vp.governanceLink': 'Open governance',
    'vp.err.exceedsBoth':
      'That is more than your wallet balance and more than you have deposited.',
    'vp.noVotes':
      'Staked, cooling-down and bonded CARB carries no votes, and neither does CARB that is not deposited in the wrapper (or not delegated).',
  },
  zh: {
    'page.title': 'CARB 代币',
    'page.description':
      'CARB 是功能代币，用于可选的手续费等级、签发方保证金和参数治理。它不发放奖励，也不承诺任何收益。',
    'page.docs': '文档',

    'stat.supply': '总供应量',
    'stat.supplyNote': '代币合约报告的总供应量',
    'stat.balance': '您的余额',
    'stat.balanceNote': '钱包中的 CARB（未质押）',
    'stat.tier': '您的手续费等级',
    'stat.tierValue': '{tier} 级',
    'stat.tierNote': '作为卖方支付的交易手续费减免 {percent}%',
    'stat.staked': '已质押',
    'stat.stakedNote': '已计入等级或仍在预热中',
    'stat.connect': '请连接钱包',
    'stat.connectNote': '连接钱包以查看您的持仓。',
    'stat.loading': '加载中…',
    'stat.unavailable': '—',

    'pos.title': '您的质押',
    'pos.description':
      '只有已完成预热的质押才计入等级。新质押需先预热；解除质押的 CARB 需冷却后才能提取。',
    'pos.counting': '已计入等级',
    'pos.warming': '预热中',
    'pos.warmingNote': '{time}后计入等级（{date}）。',
    'pos.cooling': '冷却中',
    'pos.coolingNote': '{time}后可提取（{date}）。',
    'pos.coolingReady': '可以提取。',
    'pos.none': '您没有质押或冷却中的 CARB。',
    'pos.nextTier':
      '下一等级（{tier} 级）需要 {amount} {symbol} 的有效质押，还差 {missing} {symbol}。',
    'pos.topTier': '您已处于最高等级。',
    'pos.noVotes':
      '已质押和冷却中的 CARB 没有投票权。如需投票，请在钱包中保留一部分 CARB 并进行委托。',

    'tiers.title': '等级与手续费减免',
    'tiers.description':
      '数据读取自质押合约。减免会降低您作为信用卖方（订单簿与拍卖成交）支付的交易手续费。它不会改变价格，也不适用于 AMM 兑换。',
    'tiers.tier': '等级',
    'tiers.threshold': '最低有效质押',
    'tiers.discount': '手续费减免',
    'tiers.you': '您',
    'tiers.none': '无需质押',
    'tiers.failed': '无法读取等级设置。',

    'act.title': '质押、解除质押、提取',
    'act.description':
      '数量按代币自身的小数位数精确计算。只有您确认的金额才会离开钱包。',
    'act.stake': '质押',
    'act.unstake': '解除质押',
    'act.withdraw': '提取',
    'act.amount': '数量（{symbol}）',
    'act.max': '最大',
    'act.connect': '连接钱包后才能质押。',
    'act.sending': '请在钱包中确认…',
    'act.balanceHint': '钱包余额：{amount} {symbol}',
    'act.stakedHint': '已质押（计入或预热中）：{amount} {symbol}',

    'stake.hint':
      '新质押在 {warmup} 预热期后计入等级。已质押的 CARB 没有投票权。如授权额度不足，将先授权恰好该数量，再质押（需在钱包中确认两次）。',
    'stake.step.approving':
      '第 1 步（共 2 步）：授权 {amount} {symbol} 用于质押',
    'stake.step.sending': '第 2 步（共 2 步）：质押',
    'stake.success': '质押已确认。',

    'unstake.hint':
      '解除质押后，该部分会立即停止计入等级。CARB 在 {cooldown} 冷却期后可提取；再次解除质押会让所有冷却中的数量重新开始冷却。',
    'unstake.success': '已开始解除质押，冷却期结束后可提取。',

    'withdraw.hint': '将所有冷却期已结束的 CARB 提回您的钱包。',
    'withdraw.none': '没有冷却中的代币。',
    'withdraw.wait': '{amount} {symbol} 将在 {time}后可提取。',
    'withdraw.ready': '{amount} {symbol} 可以提取。',
    'withdraw.success': '已提取到您的钱包。',

    'err.amount': '请输入大于零的数量（最多 {decimals} 位小数）。',
    'err.exceedsBalance': '超过了您的钱包余额。',
    'err.exceedsStaked': '超过了您已质押的数量。',

    'utility.title': 'CARB 的用途',
    'utility.fees':
      '手续费等级：质押 CARB 达到某一等级后，出售时可享受更低的市场手续费（最多减免一半手续费，不影响价格）。',
    'utility.bond':
      '签发方保证金：锁定 CARB 以使用基于保证金的签发方通道。保证金可通过带有异议期的流程被罚没。',
    'utility.governance':
      '治理：对有界的协议参数进行投票。投票需要先委托，已质押或已作保证金的 CARB 没有投票权。',
    'utility.not':
      'CARB 不发放奖励、不分享收入，也不承诺收益，并且无法控制碳信用签发或用户资金。',
    'utility.docs': '阅读 CARB 文档',
    'utility.governanceLink': '前往治理',

    'staking.missing': '此部署未配置质押合约，因此无法使用等级与质押功能。',
    'read.failed': '无法从链上读取 CARB 数据，请稍后再试。',

    'ext.title': '外部代币',
    'ext.body':
      '{symbol} 是在 Carbonized 之外发行的代币（例如通过发射平台）。Carbonized 只读取并使用它：无法控制其供应量、所有权、流动性，也无法控制它可能收取的任何费用。如果代币在转账时收取费用，质押、缴纳保证金和存入投票封装都会被合约拒绝。',
    'ext.symbol': '代币符号',
    'ext.decimals': '小数位数',
    'ext.address': '合约地址',
    'ext.explorer': '在区块浏览器中查看',
    'ext.risk':
      '请在使用前自行核实该代币：是否可增发、是否有所有者权限、流动性是否锁定、是否可暂停或加入黑名单。',

    'vp.title': '投票权',
    'vp.descriptionWrapper':
      '治理需要先把 {symbol} 存入投票封装（v{symbol}，1:1，无锁定期、无费用，可随时取回），再进行委托。委托后的票数从下一秒起计入。',
    'vp.descriptionNative':
      '投票权来自您钱包中已委托的 {symbol}。请在治理页面进行委托。',
    'vp.wallet': '钱包中的 {symbol}',
    'vp.wrapped': '已存入投票封装（v{symbol}）',
    'vp.delegate': '委托给',
    'vp.self': '您自己',
    'vp.none': '尚未委托：没有投票权',
    'vp.votes': '您当前持有的票数',
    'vp.connect': '连接钱包后才能查看和管理投票权。',
    'vp.unsupported':
      '此代币没有投票功能，且未配置投票封装，因此无法在此部署上使用治理投票。',
    'vp.amountHint':
      '钱包：{balance} {symbol}；已存入封装：{wrapped} v{symbol}',
    'vp.deposit': '存入',
    'vp.withdraw': '取回',
    'vp.step.approving':
      '第 1 步（共 2 步）：授权 {amount} {symbol} 用于投票封装',
    'vp.step.sending': '第 2 步（共 2 步）：存入',
    'vp.depositSuccess': '已存入投票封装。请委托（委托给自己即可）。',
    'vp.withdrawSuccess': '已取回到您的钱包。',
    'vp.delegateSuccess': '委托已更新。',
    'vp.delegateSelf': '委托给自己',
    'vp.delegateNote':
      '投票权只有在委托后才生效（委托给自己即可）；也可以在治理页面委托给其他地址。',
    'vp.governanceLink': '前往治理',
    'vp.err.exceedsBoth': '超过了您的钱包余额和已存入的数量。',
    'vp.noVotes':
      '已质押、冷却中或已作保证金的 CARB 没有投票权；未存入投票封装（或未委托）的 CARB 同样没有。',
  },
};
