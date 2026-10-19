import type { Messages } from '@/lib/i18n';

export const messages: Messages = {
  en: {
    'page.title': 'Tokenize credits',
    'page.subtitle':
      'Turn carbon credit NFTs into fungible, tradable CCT tokens - one pooled token per standard.',
    'page.stepsLabel': 'Tokenization steps',
    'tab.tokenize': 'Tokenize',
    'tab.unwrap': 'Unwrap',

    'step.select': 'Select credits',
    'step.select.desc': 'Pick the NFTs to tokenize',
    'step.review': 'Review',
    'step.review.desc': 'Preview the CCT you receive',
    'step.wrap': 'Approve & wrap',
    'step.wrap.desc': 'Sign the transactions',
    'step.done': 'Done',
    'step.done.desc': 'Your new CCT balance',

    'common.back': 'Back',
    'common.preparing': 'Preparing...',

    'gate.config.title': 'Contracts not configured',
    'gate.config.description':
      'The Carbon Credit NFT and CCT token addresses are missing. Set the NEXT_PUBLIC_CARBON_CREDIT_* variables in .env.local and restart the dev server.',
    'gate.wallet.title': 'Connect your wallet',
    'gate.wallet.description':
      'Connect the wallet that holds your carbon credit NFTs to tokenize them.',

    'empty.title': 'No carbon credits to tokenize',
    'empty.description':
      'You do not own any carbon credit NFTs yet. Register your company or request credits.',
    'empty.register': 'Register company',
    'empty.request': 'Request credits',
    'empty.issuer': 'About issuers',

    'select.cardLabel': 'Select {project}, NFT #{id}',
    'select.tonnes': 'Tonnes',
    'select.vintage': 'Vintage',
    'select.pool': 'Becomes',
    'select.flag.retired': 'Retired',
    'select.flag.empty': 'Zero tonnes',
    'select.flag.no-serial': 'No registry serial',
    'select.flag.no-proof': 'No oracle proof',
    'select.flag.unknown-methodology': 'No pool for methodology',
    'select.flag.no-pool': 'No pool configured',
    'select.noSerial': '(no serial)',
    'select.reason.retired':
      'This credit is retired and can no longer be wrapped.',
    'select.reason.empty':
      'This credit has zero tonnes; the contract rejects it with "Empty credit".',
    'select.reason.no-serial':
      'This credit has no external registry serial, so the contract rejects it with "Unverified credit". Ask the issuer that created it.',
    'select.reason.no-proof':
      'This credit has a zero oracle proof hash, so the contract rejects it with "Unverified credit". Ask the issuer that created it.',
    'select.reason.unknown-methodology':
      'There is no CCT pool for the methodology "{methodology}" (only ICM_COMPLIANCE, VERRA_VCS and GOLD_STANDARD have pools); the contract would reject it with "Methodology mismatch".',
    'select.reason.no-pool':
      'The CCT pool for this methodology is not configured in this deployment, so it cannot be wrapped here yet.',
    'select.flag.wrapped': 'Wrapped in {symbol}',
    'select.goUnwrap': 'Unwrap',
    'select.filter.label': 'Filter by standard',
    'select.filter.all': 'All',
    'select.selectAll': 'Select all eligible ({count})',
    'select.clear': 'Clear',
    'select.allWrapped':
      'No unwrapped NFTs match this filter. Everything you own is already tokenized.',
    'select.wrappedTitle': 'Already tokenized ({count})',
    'select.nothingSelected': 'Select at least one credit to continue.',
    'select.summary': '{count} credit(s) selected - {tonnes} t CO2e',
    'select.next': 'Review',

    'review.totalCct': 'CCT you will receive',
    'review.ratio': '1 tonne CO2e = 1 CCT (18 decimals)',
    'review.nfts': 'NFTs to wrap',
    'review.pools': 'across {count} pool(s)',
    'review.transactions': 'Transactions',
    'review.txBreakdown': '{wraps} wrap + {approvals} approval',
    'review.approved': 'Already approved',
    'review.needsApproval': 'Approval needed',
    'review.mint': 'You receive',
    'review.currentBalance': 'Current balance',
    'review.afterBalance': 'Balance after',
    'review.lockNote':
      'Each NFT is transferred to the pooled token contract and locked there as 1:1 backing for the CCT minted to you.',
    'review.reversible':
      'Wrapping is reversible: burn the same amount of CCT from the Unwrap tab to get the NFT back.',
    'review.nonTradable':
      'Heads-up: the marketplace order book currently settles CCT-VCS only. CCT-GS and CCT-ICM can be held and unwrapped, but not listed yet.',
    'review.confirm': 'Continue to transactions',

    'exec.progress': '{done} of {total} transactions confirmed',
    'exec.progressLabel': 'Transaction progress',
    'exec.hint':
      'Your wallet will ask you to sign each transaction. Keep this page open until all of them are confirmed.',
    'exec.approveTitle': 'Approve {symbol} to move your NFTs',
    'exec.wrapTitle': 'Wrap NFT #{id} ({tonnes} t) into {symbol}',
    'exec.status.idle': 'Waiting',
    'exec.status.wallet': 'Confirm in your wallet...',
    'exec.status.confirming': 'Waiting for onchain confirmation...',
    'exec.status.success': 'Confirmed',
    'exec.status.error': 'Failed',
    'exec.status.rejected': 'Rejected in wallet',
    'exec.rejectedHint':
      'You dismissed the request in your wallet. Nothing was sent - retry when ready.',
    'exec.viewTx': 'View transaction on explorer',
    'exec.start': 'Start transactions',
    'exec.running': 'Processing...',
    'exec.retry': 'Retry failed transaction',
    'exec.resume': 'Resume',
    'exec.finishPartial': 'Finish with wrapped credits',

    'success.title': 'Tokenization complete',
    'success.subtitle': '{count} NFT(s) wrapped into {tonnes} CCT.',
    'success.minted': 'Minted',
    'success.balance': 'New balance',
    'success.nftsLocked': '{count} NFT(s) locked as backing.',
    'success.nonTradable':
      'These tokens are not accepted by the order book yet (it settles CCT-VCS only). You can hold them or unwrap later.',
    'success.sell': 'Sell on the market',
    'success.marketplace': 'Browse marketplace',
    'success.portfolio': 'View portfolio',
    'success.again': 'Tokenize more',

    'unwrap.intro':
      'Burn CCT to release the NFT locked behind it. The CCT amount burned equals the NFT tonnes.',
    'unwrap.burn': 'CCT burned',
    'unwrap.yourBalance': 'Your balance',
    'unwrap.shortfall': 'You need {amount} more {symbol} to unwrap this NFT.',
    'unwrap.action': 'Unwrap NFT',
    'unwrap.working': 'Unwrapping...',
    'unwrap.empty.title': 'Nothing to unwrap',
    'unwrap.empty.description':
      'NFTs you wrap into CCT will be listed here so you can redeem them later.',
    'unwrap.empty.cta': 'View portfolio',
    'unwrap.toast.wallet': 'Confirm the unwrap in your wallet...',
    'unwrap.toast.confirming': 'Waiting for confirmation...',
    'unwrap.toast.success': 'NFT #{id} unwrapped and returned to your wallet.',

    'tx.rejected': 'Transaction rejected in your wallet.',
    'tx.failed': 'Transaction failed.',
    'tx.reverted': 'Transaction reverted onchain.',
  },
  zh: {
    'page.title': '碳信用代币化',
    'page.subtitle':
      '将碳信用 NFT 转换为可互换、可交易的 CCT 代币 - 每个标准对应一个汇集代币。',
    'page.stepsLabel': '代币化步骤',
    'tab.tokenize': '代币化',
    'tab.unwrap': '解包',

    'step.select': '选择碳信用',
    'step.select.desc': '选择要代币化的 NFT',
    'step.review': '审核',
    'step.review.desc': '预览您将收到的 CCT',
    'step.wrap': '授权并封装',
    'step.wrap.desc': '签署交易',
    'step.done': '完成',
    'step.done.desc': '您新的 CCT 余额',

    'common.back': '返回',
    'common.preparing': '准备中...',

    'gate.config.title': '合约未配置',
    'gate.config.description':
      '缺少 Carbon Credit NFT 和 CCT 代币地址。请在 .env.local 中设置 NEXT_PUBLIC_CARBON_CREDIT_* 变量并重启开发服务器。',
    'gate.wallet.title': '连接您的钱包',
    'gate.wallet.description': '连接持有您碳信用 NFT 的钱包以进行代币化。',

    'empty.title': '没有可代币化的碳信用',
    'empty.description':
      '您还没有任何碳信用 NFT。请注册您的企业，或申请碳信用。',
    'empty.register': '注册企业',
    'empty.request': '申请碳信用',
    'empty.issuer': '了解签发方',

    'select.cardLabel': '选择 {project}，NFT #{id}',
    'select.tonnes': '吨数',
    'select.vintage': '年份',
    'select.pool': '将变为',
    'select.flag.retired': '已注销',
    'select.flag.empty': '吨数为零',
    'select.flag.no-serial': '无注册表序列号',
    'select.flag.no-proof': '无预言机证明',
    'select.flag.unknown-methodology': '无对应池',
    'select.flag.no-pool': '未配置池',
    'select.noSerial': '（无序列号）',
    'select.reason.retired': '此碳信用已注销，无法封装。',
    'select.reason.empty':
      '此碳信用的吨数为零，合约会以“Empty credit”拒绝封装。',
    'select.reason.no-serial':
      '此碳信用没有外部注册表序列号，合约会以“Unverified credit”拒绝封装。请联系签发方。',
    'select.reason.no-proof':
      '此碳信用的预言机证明哈希为零，合约会以“Unverified credit”拒绝封装。请联系签发方。',
    'select.reason.unknown-methodology':
      '方法学“{methodology}”没有对应的 CCT 池（仅支持 ICM_COMPLIANCE、VERRA_VCS、GOLD_STANDARD），合约会以“Methodology mismatch”拒绝封装。',
    'select.reason.no-pool':
      '此方法学的 CCT 池尚未在当前部署中配置，暂时无法封装。',
    'select.flag.wrapped': '已封装为 {symbol}',
    'select.goUnwrap': '解包',
    'select.filter.label': '按标准筛选',
    'select.filter.all': '全部',
    'select.selectAll': '全选符合条件的（{count}）',
    'select.clear': '清除',
    'select.allWrapped':
      '没有符合此筛选条件的未封装 NFT。您拥有的所有 NFT 均已代币化。',
    'select.wrappedTitle': '已代币化（{count}）',
    'select.nothingSelected': '请至少选择一项碳信用以继续。',
    'select.summary': '已选择 {count} 项碳信用 - {tonnes} t CO2e',
    'select.next': '审核',

    'review.totalCct': '您将收到的 CCT',
    'review.ratio': '1 吨 CO2e = 1 CCT（18 位小数）',
    'review.nfts': '待封装的 NFT',
    'review.pools': '涉及 {count} 个池',
    'review.transactions': '交易',
    'review.txBreakdown': '{wraps} 次封装 + {approvals} 次授权',
    'review.approved': '已授权',
    'review.needsApproval': '需要授权',
    'review.mint': '您将收到',
    'review.currentBalance': '当前余额',
    'review.afterBalance': '之后余额',
    'review.lockNote':
      '每个 NFT 都会转入汇集代币合约并锁定，作为铸造给您的 CCT 的 1:1 抵押。',
    'review.reversible':
      '封装是可逆的：在“解包”标签页销毁相同数量的 CCT 即可取回 NFT。',
    'review.nonTradable':
      '提示：市场订单簿目前仅结算 CCT-VCS。CCT-GS 和 CCT-ICM 可持有和解包，但暂时无法挂单。',
    'review.confirm': '继续进行交易',

    'exec.progress': '已确认 {done}/{total} 笔交易',
    'exec.progressLabel': '交易进度',
    'exec.hint':
      '您的钱包会要求您签署每笔交易。请保持此页面打开，直到全部确认。',
    'exec.approveTitle': '授权 {symbol} 转移您的 NFT',
    'exec.wrapTitle': '将 NFT #{id}（{tonnes} t）封装为 {symbol}',
    'exec.status.idle': '等待中',
    'exec.status.wallet': '请在钱包中确认...',
    'exec.status.confirming': '等待链上确认...',
    'exec.status.success': '已确认',
    'exec.status.error': '失败',
    'exec.status.rejected': '已在钱包中拒绝',
    'exec.rejectedHint':
      '您已在钱包中关闭请求。未发送任何内容 - 准备好后请重试。',
    'exec.viewTx': '在区块浏览器中查看交易',
    'exec.start': '开始交易',
    'exec.running': '处理中...',
    'exec.retry': '重试失败的交易',
    'exec.resume': '继续',
    'exec.finishPartial': '以已封装的碳信用完成',

    'success.title': '代币化完成',
    'success.subtitle': '{count} 个 NFT 已封装为 {tonnes} CCT。',
    'success.minted': '已铸造',
    'success.balance': '新余额',
    'success.nftsLocked': '{count} 个 NFT 已锁定作为抵押。',
    'success.nonTradable':
      '订单簿暂不接受这些代币（仅结算 CCT-VCS）。您可以持有或稍后解包。',
    'success.sell': '在市场出售',
    'success.marketplace': '浏览市场',
    'success.portfolio': '查看投资组合',
    'success.again': '继续代币化',

    'unwrap.intro':
      '销毁 CCT 以释放其背后锁定的 NFT。销毁的 CCT 数量等于 NFT 的吨数。',
    'unwrap.burn': '销毁的 CCT',
    'unwrap.yourBalance': '您的余额',
    'unwrap.shortfall': '您还需要 {amount} {symbol} 才能解包此 NFT。',
    'unwrap.action': '解包 NFT',
    'unwrap.working': '解包中...',
    'unwrap.empty.title': '没有可解包的内容',
    'unwrap.empty.description':
      '您封装为 CCT 的 NFT 将在此列出，方便日后赎回。',
    'unwrap.empty.cta': '查看投资组合',
    'unwrap.toast.wallet': '请在钱包中确认解包...',
    'unwrap.toast.confirming': '等待确认...',
    'unwrap.toast.success': 'NFT #{id} 已解包并返回您的钱包。',

    'tx.rejected': '交易已在您的钱包中被拒绝。',
    'tx.failed': '交易失败。',
    'tx.reverted': '交易在链上被回滚。',
  },
};
