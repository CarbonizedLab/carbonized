import type { Messages } from '@/lib/i18n';

export const messages: Messages = {
  en: {
    'page.title': 'Governance',
    'page.description':
      'CARB holders vote on a short list of bounded protocol parameters. Governance cannot touch credit issuance or user funds.',
    'page.docs': 'Docs',

    'cfg.title': 'How voting works here',
    'cfg.delay': 'Voting delay',
    'cfg.period': 'Voting period',
    'cfg.threshold': 'Proposal threshold',
    'cfg.quorum': 'Quorum',
    'cfg.quorumValue': '{percent}% of total supply at the snapshot',
    'cfg.note':
      'Durations run on the chain clock in seconds. Quorum is counted against total supply, including CARB that cannot vote (staked, bonded or held in treasury), and counts votes for plus abstain. A proposal passes when quorum is reached and there are more votes for than against; it then waits in the timelock before it can be executed.',
    'cfg.failed': 'Governor settings could not be read.',

    'del.title': 'Your voting power',
    'del.description':
      'CARB only votes after you delegate it, to yourself or to someone you trust. Delegating does not move your tokens.',
    'del.balance': 'CARB in your wallet',
    'del.delegate': 'Delegated to',
    'del.self': 'Yourself',
    'del.none': 'Nobody yet: no voting power',
    'del.votes': 'Votes you hold now',
    'del.toSelf': 'Delegate to myself',
    'del.otherLabel': 'Delegate to another address',
    'del.otherHint':
      'The delegate votes with your CARB; you can change it any time.',
    'del.toOther': 'Delegate',
    'del.sending': 'Confirm in your wallet…',
    'del.success': 'Delegation updated.',
    'del.note':
      'Votes are counted at the moment a proposal opens for voting, so delegate before then. Staked and bonded CARB does not vote.',
    'del.connect': 'Connect a wallet to delegate.',
    'del.notConfigured': 'The token is not configured.',
    'err.address': 'Enter a valid, non-zero address.',
    'cfg.quorumValueWrapper':
      '{percent}% of the CARB deposited in the voting wrapper (v{symbol}) at the snapshot',
    'cfg.noteWrapper':
      'Durations run on the chain clock in seconds. Quorum is counted against the CARB deposited in the voting wrapper at the snapshot (not the token’s total supply), and counts votes for plus abstain, so a small wrapped supply means a small quorum. A proposal passes when quorum is reached and there are more votes for than against; it then waits in the timelock before it can be executed. Only CARB that is deposited in the wrapper and delegated has votes.',
    'del.balanceWrapped': 'Deposited in the voting wrapper (vCARB)',
    'del.wrapperNote':
      'Governance on this deployment uses the voting wrapper: deposit CARB into it on the token page first (1:1, withdraw any time), then delegate here.',
    'del.wrapperLink': 'Open the token page',
    'del.unsupported':
      'This token has no voting functions and no voting wrapper is configured, so delegating and voting are unavailable.',

    'list.title': 'Proposals',
    'list.description': 'Read from the governor’s onchain events.',
    'list.empty': 'No proposals have been created yet.',
    'list.partial':
      'Only recent blocks were scanned. Older proposals may be missing; set NEXT_PUBLIC_DEPLOY_BLOCK to scan the full history.',
    'list.more': 'Showing the latest {shown} of {total} proposals.',
    'list.failed': 'Proposals could not be loaded. Try again later.',
    'list.loading': 'Loading proposals…',

    'state.pending': 'Pending',
    'state.active': 'Voting open',
    'state.canceled': 'Canceled',
    'state.defeated': 'Defeated',
    'state.succeeded': 'Succeeded',
    'state.queued': 'Queued',
    'state.expired': 'Expired',
    'state.executed': 'Executed',

    'p.untitled': 'Untitled proposal',
    'p.id': 'Proposal ID',
    'p.proposer': 'Proposed by',
    'p.opens': 'Voting opens {date}.',
    'p.endsIn': 'Voting ends in {time} ({date}).',
    'p.ended': 'Voting ended {date}.',
    'p.for': 'For',
    'p.against': 'Against',
    'p.abstain': 'Abstain',
    'p.quorum': 'Quorum: {have} of {need} {symbol} (for + abstain).',
    'p.quorumReached': 'Quorum reached.',
    'p.quorumMissing': 'Quorum not reached.',
    'p.quorumLater': 'Quorum is fixed when voting opens.',
    'p.myVotes': 'Your voting power on this proposal: {amount} {symbol}.',
    'p.noPower':
      'You had no voting power when this proposal opened, so a vote would count for zero. Delegate before a proposal opens.',
    'p.voted': 'You have voted on this proposal.',
    'p.connect': 'Connect a wallet to vote.',
    'p.voteFor': 'Vote for',
    'p.voteAgainst': 'Vote against',
    'p.voteAbstain': 'Abstain',
    'p.voting': 'Confirm in your wallet…',
    'p.voteSuccess': 'Vote recorded.',
    'p.queueHint':
      'This proposal succeeded. Queue it to start the timelock delay.',
    'p.queue': 'Queue',
    'p.queueSuccess': 'Proposal queued.',
    'p.queuedWait': 'Executable in {time} ({date}).',
    'p.queuedReady': 'The timelock delay has passed: anyone can execute.',
    'p.execute': 'Execute',
    'p.executeSuccess': 'Proposal executed.',
    'p.calls': 'Calls ({count})',
    'p.description': 'Full description',

    'new.title': 'Propose a parameter change',
    'new.description':
      'A guided form for the few parameters governance can change. You see a plain-language summary before anything is sent.',
    'new.outside':
      'Only these changes can be proposed here: marketplace minimum price, trading fee, KYC gate, fee-discount provider, staking tier thresholds and the issuer bond minimum. Any other target is blocked.',
    'new.threshold':
      'Proposing needs at least {amount} {symbol} of delegated voting power. You hold {votes} {symbol} of votes now.',
    'new.thresholdUnknown':
      'Proposing needs delegated voting power above the proposal threshold; the transaction fails if you have too little.',
    'new.connect': 'Connect a wallet to propose.',
    'new.action': 'What do you want to change?',
    'new.titleLabel': 'Proposal title',
    'new.titleHint': 'A short headline, up to {max} characters.',
    'new.notConfigured':
      'This change is unavailable because its contract is not configured on this deployment.',
    'new.paymentUnknown':
      'The payment token’s decimals could not be read, so price changes are unavailable.',
    'new.summaryTitle': 'What happens if this passes',
    'new.willCall': 'The timelock will call {fn}({args}) on {target}.',
    'new.rawData': 'Raw calldata',
    'new.timeline':
      'After you submit: voting opens in {delay} and stays open for {period}. It passes if quorum is reached and more votes are for than against, then waits in the timelock before anyone can execute it.',
    'new.englishNote': 'The onchain description is written in English.',
    'new.ack':
      'I have read the summary and understand this is a public onchain proposal.',
    'new.submit': 'Submit proposal',
    'new.submitting': 'Confirm in your wallet…',
    'new.success': 'Proposal submitted. It appears in the list once confirmed.',
    'new.blocked':
      'This contract is not on the governor allowlist, so the proposal is blocked.',
    'new.noCode':
      'The provider address has no contract code, so the change would fail when executed.',
    'new.checking': 'Checking…',

    'act.minPrice': 'Marketplace minimum price',
    'act.minPrice.desc':
      'Lowest price per tonne a new order or auction may use.',
    'act.fee': 'Marketplace trading fee',
    'act.fee.desc': 'The base fee in basis points (at most 100 = 1%).',
    'act.kyc': 'Marketplace KYC gate',
    'act.kyc.desc':
      'Whether KYC approval is required to add liquidity, swap, create auctions or bid.',
    'act.provider': 'Fee-discount provider',
    'act.provider.desc':
      'The contract that decides each seller’s fee discount (or none).',
    'act.thresholds': 'Staking tier thresholds',
    'act.thresholds.desc': 'Minimum counting stake for tiers 1, 2 and 3.',
    'act.minBond': 'Issuer bond minimum',
    'act.minBond.desc':
      'Smallest CARB bond that unlocks the bond-based issuer path.',

    'f.price': 'Minimum price per tonne (payment token, e.g. USDG)',
    'f.price.hint': 'Decimal amount, for example 0.01.',
    'f.fee': 'Trading fee (basis points)',
    'f.fee.hint': 'Whole number from 0 to 100. 25 means 0.25%.',
    'f.kyc': 'KYC gate',
    'f.kyc.on': 'On (KYC required)',
    'f.kyc.off': 'Off',
    'f.providerMode': 'Provider',
    'f.providerMode.set': 'Set a provider contract',
    'f.providerMode.off': 'No provider (no discounts)',
    'f.provider': 'Provider contract address',
    'f.provider.hint': 'Must be a contract. Normally the staking contract.',
    'f.provider.useStaking': 'Use the staking contract',
    'f.t1': 'Tier 1 threshold (CARB)',
    'f.t2': 'Tier 2 threshold (CARB)',
    'f.t3': 'Tier 3 threshold (CARB)',
    'f.minBond': 'Minimum bond (CARB)',
    'f.minBond.hint': 'Applies to new bonds and top-ups only.',

    'err.price': 'Enter a price greater than zero (up to {decimals} decimals).',
    'err.priceMax': 'The contract allows at most {max} per tonne.',
    'err.fee': 'Enter a whole number of basis points from 0 to {max}.',
    'err.carb': 'Enter a CARB amount (up to {decimals} decimals).',
    'err.thresholdLow': 'Tier 1 must be at least 1 CARB.',
    'err.thresholdOrder': 'Each tier must be higher than the one before.',
    'err.thresholdHigh': 'Tier 3 can be at most {max} CARB.',
    'err.bondBounds': 'The bond minimum must be between {min} and {max} CARB.',
    'err.titleRequired': 'Add a short title.',

    'sum.minPrice':
      'Change the marketplace minimum price per tonne from {from} to {to} (payment-token units, such as USDG). New orders and auctions below the minimum are rejected.',
    'sum.fee':
      'Change the marketplace trading fee from {from} to {to} basis points ({percent}%). It applies to orders and auctions created afterwards and to AMM swaps; open orders keep the fee they were created with.',
    'sum.kycOn':
      'Turn the marketplace KYC gate on: addresses without KYC approval cannot add liquidity, swap, create auctions or bid. Exits stay open.',
    'sum.kycOff':
      'Turn the marketplace KYC gate off: KYC approval is no longer required to add liquidity, swap, create auctions or bid.',
    'sum.providerSet':
      'Set the marketplace fee-discount provider to {address}. That contract decides who gets a discount on the trading fee (at most half of the fee, never on the price).',
    'sum.providerOff':
      'Switch the fee-discount provider off: nobody gets a discount on the trading fee.',
    'sum.thresholds':
      'Change the staking tier thresholds (tiers 1 / 2 / 3) from {f1} / {f2} / {f3} to {t1} / {t2} / {t3} CARB. It takes effect immediately for every staker.',
    'sum.minBond':
      'Change the minimum issuer bond from {from} to {to} CARB. It applies to new bonds and top-ups; existing bonds are unaffected.',
  },
  zh: {
    'page.title': '治理',
    'page.description':
      'CARB 持有者对少数有界的协议参数进行投票。治理无法触及碳信用签发或用户资金。',
    'page.docs': '文档',

    'cfg.title': '这里的投票规则',
    'cfg.delay': '投票延迟',
    'cfg.period': '投票期',
    'cfg.threshold': '提案门槛',
    'cfg.quorum': '法定人数',
    'cfg.quorumValue': '快照时总供应量的 {percent}%',
    'cfg.note':
      '时长按链上时钟以秒计算。法定人数按总供应量计算（包括无法投票的 CARB，如已质押、已作保证金或国库持有的部分），并统计赞成票与弃权票之和。提案在达到法定人数且赞成票多于反对票时通过，随后需在时间锁中等待，之后才能执行。',
    'cfg.failed': '无法读取治理合约设置。',

    'del.title': '您的投票权',
    'del.description':
      'CARB 只有在您委托之后才能投票，可以委托给自己或您信任的人。委托不会转移您的代币。',
    'del.balance': '钱包中的 CARB',
    'del.delegate': '委托给',
    'del.self': '您自己',
    'del.none': '尚未委托：没有投票权',
    'del.votes': '您当前持有的票数',
    'del.toSelf': '委托给自己',
    'del.otherLabel': '委托给其他地址',
    'del.otherHint': '被委托人将使用您的 CARB 投票；您可以随时更改。',
    'del.toOther': '委托',
    'del.sending': '请在钱包中确认…',
    'del.success': '委托已更新。',
    'del.note':
      '票数按提案开放投票时的数量计算，请在此之前完成委托。已质押和已作保证金的 CARB 没有投票权。',
    'del.connect': '连接钱包后才能委托。',
    'del.notConfigured': '代币未配置。',
    'err.address': '请输入有效的非零地址。',
    'cfg.quorumValueWrapper':
      '快照时已存入投票封装的 CARB（v{symbol}）总量的 {percent}%',
    'cfg.noteWrapper':
      '时长按链上时钟以秒计。法定人数按快照时投票封装中已存入的 CARB 总量计算（而不是 CARB 的总供应量），计入赞成与弃权票。当达到法定人数且赞成票多于反对票时提案通过，之后在时间锁中等待才能执行。只有存入投票封装并委托的 CARB 才有票数。',
    'del.balanceWrapped': '已存入投票封装（vCARB）',
    'del.wrapperNote':
      '此部署的治理使用投票封装：请先在代币页面把 CARB 存入封装（1:1，可随时取回），再在此委托。',
    'del.wrapperLink': '前往代币页面',
    'del.unsupported':
      '此代币没有投票功能，且未配置投票封装，因此无法委托或投票。',

    'list.title': '提案',
    'list.description': '读取自治理合约的链上事件。',
    'list.empty': '尚未创建任何提案。',
    'list.partial':
      '仅扫描了最近的区块，较早的提案可能缺失；设置 NEXT_PUBLIC_DEPLOY_BLOCK 可扫描完整历史。',
    'list.more': '显示最新 {shown} 个提案，共 {total} 个。',
    'list.failed': '无法加载提案，请稍后再试。',
    'list.loading': '正在加载提案…',

    'state.pending': '待开始',
    'state.active': '投票中',
    'state.canceled': '已取消',
    'state.defeated': '未通过',
    'state.succeeded': '已通过',
    'state.queued': '已排队',
    'state.expired': '已过期',
    'state.executed': '已执行',

    'p.untitled': '未命名提案',
    'p.id': '提案编号',
    'p.proposer': '提案人',
    'p.opens': '投票将于 {date} 开始。',
    'p.endsIn': '投票将在 {time}后结束（{date}）。',
    'p.ended': '投票已于 {date} 结束。',
    'p.for': '赞成',
    'p.against': '反对',
    'p.abstain': '弃权',
    'p.quorum': '法定人数：{have} / {need} {symbol}（赞成 + 弃权）。',
    'p.quorumReached': '已达到法定人数。',
    'p.quorumMissing': '未达到法定人数。',
    'p.quorumLater': '法定人数在投票开始时确定。',
    'p.myVotes': '您在该提案上的投票权：{amount} {symbol}。',
    'p.noPower':
      '提案开放投票时您没有投票权，因此投票将计为零。请在提案开放前完成委托。',
    'p.voted': '您已对该提案投票。',
    'p.connect': '连接钱包后才能投票。',
    'p.voteFor': '投赞成票',
    'p.voteAgainst': '投反对票',
    'p.voteAbstain': '弃权',
    'p.voting': '请在钱包中确认…',
    'p.voteSuccess': '投票已记录。',
    'p.queueHint': '该提案已通过。请将其排队以开始时间锁延迟。',
    'p.queue': '排队',
    'p.queueSuccess': '提案已排队。',
    'p.queuedWait': '{time}后可执行（{date}）。',
    'p.queuedReady': '时间锁延迟已结束：任何人都可以执行。',
    'p.execute': '执行',
    'p.executeSuccess': '提案已执行。',
    'p.calls': '调用（{count}）',
    'p.description': '完整描述',

    'new.title': '提出参数变更',
    'new.description':
      '针对治理可以修改的少数参数的引导式表单。发送之前，您会看到通俗易懂的摘要。',
    'new.outside':
      '这里只能提出以下变更：市场最低价格、交易手续费、KYC 门槛、手续费减免提供者、质押等级门槛和签发方最低保证金。其他任何目标都会被拦截。',
    'new.threshold':
      '提案需要至少 {amount} {symbol} 的已委托投票权。您当前持有 {votes} {symbol} 的票数。',
    'new.thresholdUnknown':
      '提案需要超过提案门槛的已委托投票权；若票数不足，交易会失败。',
    'new.connect': '连接钱包后才能提案。',
    'new.action': '您想修改什么？',
    'new.titleLabel': '提案标题',
    'new.titleHint': '简短的标题，最多 {max} 个字符。',
    'new.notConfigured': '此部署未配置对应合约，因此无法提出该变更。',
    'new.paymentUnknown': '无法读取支付代币的小数位数，因此无法提出价格变更。',
    'new.summaryTitle': '若通过将发生什么',
    'new.willCall': '时间锁将在 {target} 上调用 {fn}({args})。',
    'new.rawData': '原始调用数据',
    'new.timeline':
      '提交后：投票将在 {delay}后开始，并持续 {period}。达到法定人数且赞成票多于反对票即通过，随后在时间锁中等待，之后任何人都可以执行。',
    'new.englishNote': '链上描述以英文撰写。',
    'new.ack': '我已阅读摘要，并理解这是一个公开的链上提案。',
    'new.submit': '提交提案',
    'new.submitting': '请在钱包中确认…',
    'new.success': '提案已提交，确认后会出现在列表中。',
    'new.blocked': '该合约不在治理合约的允许列表中，提案已被拦截。',
    'new.noCode': '该提供者地址没有合约代码，变更在执行时会失败。',
    'new.checking': '检查中…',

    'act.minPrice': '市场最低价格',
    'act.minPrice.desc': '新订单或拍卖允许使用的每吨最低价格。',
    'act.fee': '市场交易手续费',
    'act.fee.desc': '基础手续费，以基点计（最高 100 = 1%）。',
    'act.kyc': '市场 KYC 门槛',
    'act.kyc.desc': '添加流动性、兑换、创建拍卖或出价是否需要 KYC 批准。',
    'act.provider': '手续费减免提供者',
    'act.provider.desc': '决定每位卖方手续费减免的合约（或不提供减免）。',
    'act.thresholds': '质押等级门槛',
    'act.thresholds.desc': '1、2、3 级所需的最低有效质押。',
    'act.minBond': '签发方最低保证金',
    'act.minBond.desc': '开通基于保证金的签发方通道所需的最低 CARB 保证金。',

    'f.price': '每吨最低价格（支付代币，如 USDG）',
    'f.price.hint': '十进制数额，例如 0.01。',
    'f.fee': '交易手续费（基点）',
    'f.fee.hint': '0 到 100 的整数。25 表示 0.25%。',
    'f.kyc': 'KYC 门槛',
    'f.kyc.on': '开启（需要 KYC）',
    'f.kyc.off': '关闭',
    'f.providerMode': '提供者',
    'f.providerMode.set': '设置提供者合约',
    'f.providerMode.off': '不设提供者（无减免）',
    'f.provider': '提供者合约地址',
    'f.provider.hint': '必须是合约。通常为质押合约。',
    'f.provider.useStaking': '使用质押合约',
    'f.t1': '1 级门槛（CARB）',
    'f.t2': '2 级门槛（CARB）',
    'f.t3': '3 级门槛（CARB）',
    'f.minBond': '最低保证金（CARB）',
    'f.minBond.hint': '仅适用于新的保证金和追加。',

    'err.price': '请输入大于零的价格（最多 {decimals} 位小数）。',
    'err.priceMax': '合约允许的每吨价格上限为 {max}。',
    'err.fee': '请输入 0 到 {max} 之间的整数基点。',
    'err.carb': '请输入 CARB 数量（最多 {decimals} 位小数）。',
    'err.thresholdLow': '1 级门槛至少为 1 CARB。',
    'err.thresholdOrder': '每个等级的门槛必须高于上一级。',
    'err.thresholdHigh': '3 级门槛最高为 {max} CARB。',
    'err.bondBounds': '最低保证金必须在 {min} 到 {max} CARB 之间。',
    'err.titleRequired': '请填写一个简短的标题。',

    'sum.minPrice':
      '将市场每吨最低价格从 {from} 改为 {to}（支付代币单位，如 USDG）。低于最低价的新订单和拍卖将被拒绝。',
    'sum.fee':
      '将市场交易手续费从 {from} 基点改为 {to} 基点（{percent}%）。它适用于此后创建的订单和拍卖以及 AMM 兑换；已有订单保持创建时的手续费。',
    'sum.kycOn':
      '开启市场 KYC 门槛：未获 KYC 批准的地址将无法添加流动性、兑换、创建拍卖或出价。退出操作保持开放。',
    'sum.kycOff':
      '关闭市场 KYC 门槛：添加流动性、兑换、创建拍卖或出价不再需要 KYC 批准。',
    'sum.providerSet':
      '将市场手续费减免提供者设为 {address}。该合约决定谁可享受交易手续费减免（最多减免一半手续费，不影响价格）。',
    'sum.providerOff': '关闭手续费减免提供者：任何人都无法享受交易手续费减免。',
    'sum.thresholds':
      '将质押等级门槛（1 / 2 / 3 级）从 {f1} / {f2} / {f3} 改为 {t1} / {t2} / {t3} CARB。对所有质押者立即生效。',
    'sum.minBond':
      '将签发方最低保证金从 {from} 改为 {to} CARB。适用于新的保证金和追加；现有保证金不受影响。',
  },
};
