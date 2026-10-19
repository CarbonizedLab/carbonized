import type { Messages } from '@/lib/i18n';

export const bondMessages: Messages = {
  en: {
    'bond.title': 'Issuer bond',
    'bond.description':
      'A second way to become an issuer: lock a CARB bond instead of being granted the role directly by the multisig. A bond is a deterrent, not a verification of credit quality, and it can be slashed.',
    'bond.docs': 'How the bond works',
    'bond.connect': 'Connect a wallet to see your bond.',
    'bond.loading': 'Loading bond…',
    'bond.failed': 'The bond could not be read. Try again later.',

    'bond.current': 'Your bond',
    'bond.minimum': 'Minimum bond',
    'bond.minimumNote':
      'Applies to new bonds and top-ups; existing bonds are grandfathered.',
    'bond.path': 'Bond path',
    'bond.pathOpen': 'Open',
    'bond.pathClosed': 'Closed (no new bonds)',
    'bond.status': 'Status',
    'bond.status.none': 'No bond',
    'bond.status.bonded':
      'Bonded: the issuer role was granted through the bond',
    'bond.status.bondedDirect':
      'Bonded; the issuer role is not managed by this bond (granted directly, or revoked by the administrator)',
    'bond.status.below':
      'Bonded below the minimum: the bond-granted role is off until you top up',
    'bond.status.unbonding':
      'Unbonding: issuer role from the bond revoked, withdrawable in {time} ({date})',
    'bond.status.ready': 'Unbonding finished: you can withdraw',
    'bond.requirement':
      'To use the bond path, bond at least {amount} {symbol} in total.',
    'bond.blocked':
      'This address is barred from the bond path by the administrator.',
    'bond.pathClosedNote':
      'The bond path is closed, so new bonding is not accepted right now.',

    'bond.amount': 'Amount to bond ({symbol})',
    'bond.walletHint': 'Wallet balance: {amount} {symbol}',
    'bond.max': 'Max',
    'bond.action': 'Bond',
    'bond.approving': 'Step 1 of 2: approve {amount} {symbol} for the bond',
    'bond.sending': 'Step 2 of 2: bond',
    'bond.confirm': 'Confirm in your wallet…',
    'bond.success': 'Bond confirmed.',
    'bond.err.amount':
      'Enter an amount greater than zero (up to {decimals} decimals).',
    'bond.err.balance': 'That is more than your wallet balance.',
    'bond.err.minimum':
      'Your total bond would stay below the minimum of {amount} {symbol}.',

    'bond.unbond': 'Start unbonding',
    'bond.unbondNote':
      'Your bond-granted issuer role is revoked immediately, and the bond is withdrawable after {delay}. It cannot start while a slash proposal is pending.',
    'bond.unbondSuccess': 'Unbonding started.',
    'bond.withdraw': 'Withdraw bond',
    'bond.withdrawNote':
      'Available once the unbonding delay has passed and no slash proposal is pending.',
    'bond.withdrawSuccess': 'Bond withdrawn to your wallet.',

    'slash.title': 'Slash proposal pending',
    'slash.intro':
      'A slash proposal is open against your bond. Unbonding and withdrawing are frozen until it is executed, cancelled or lapses.',
    'slash.amount': 'Amount at risk',
    'slash.reason': 'Stated reason',
    'slash.noReason': 'No reason could be loaded.',
    'slash.windowOpen':
      'Dispute window ends in {time} ({date}). Until then it cannot be executed.',
    'slash.windowClosed':
      'The dispute window has ended. An undisputed proposal can be executed by anyone until {date}; after that it lapses.',
    'slash.windowClosedDisputed':
      'The dispute window has ended. Because you disputed it, only the slasher can execute it, until {date}; after that it lapses.',
    'slash.disputed': 'You have disputed this proposal.',
    'slash.evidence': 'Evidence (text, link or a 0x… 32-byte hash)',
    'slash.evidenceHint':
      'Only a hash is stored onchain. Text or a link is hashed (keccak-256) in your browser; keep the original somewhere reviewers can read it.',
    'slash.dispute': 'Dispute slash',
    'slash.disputeSuccess': 'Dispute recorded.',
    'slash.err.evidence': 'Add evidence to hash, or paste a 0x… 32-byte hash.',
    'slash.dest.burn': 'Slashed tokens are burned.',
    'slash.dest.burnOrSink':
      'Slashed tokens are burned if the token supports burning, otherwise sent to the slash sink {address}. The onchain event records which one happened.',
    'slash.dest.treasury':
      'Slashed tokens are sent to the slash treasury {address} (not burned).',
    'slash.last.title': 'Last slash',
    'slash.last.burned': '{amount} {symbol} burned.',
    'slash.last.sent': '{amount} {symbol} sent to {address} (not burned).',
  },
  zh: {
    'bond.title': '签发方保证金',
    'bond.description':
      '成为签发方的另一种途径：锁定 CARB 保证金，而不是由多签直接授予角色。保证金是一种威慑，并不代表对碳信用质量的核验，并且可能被罚没。',
    'bond.docs': '保证金如何运作',
    'bond.connect': '连接钱包以查看您的保证金。',
    'bond.loading': '正在加载保证金…',
    'bond.failed': '无法读取保证金，请稍后再试。',

    'bond.current': '您的保证金',
    'bond.minimum': '最低保证金',
    'bond.minimumNote': '适用于新的保证金和追加；现有保证金不受影响。',
    'bond.path': '保证金通道',
    'bond.pathOpen': '开放',
    'bond.pathClosed': '已关闭（不接受新的保证金）',
    'bond.status': '状态',
    'bond.status.none': '无保证金',
    'bond.status.bonded': '已缴纳：签发方角色通过保证金授予',
    'bond.status.bondedDirect':
      '已缴纳；签发方角色不由此保证金管理（直接授予，或已被管理员撤销）',
    'bond.status.below':
      '保证金低于最低要求：补足前，通过保证金授予的角色处于关闭状态',
    'bond.status.unbonding':
      '解锁中：通过保证金授予的签发方角色已撤销，{time}后可提取（{date}）',
    'bond.status.ready': '解锁已完成：您可以提取',
    'bond.requirement': '使用保证金通道，需累计缴纳至少 {amount} {symbol}。',
    'bond.blocked': '管理员已禁止该地址使用保证金通道。',
    'bond.pathClosedNote': '保证金通道已关闭，目前不接受新的保证金。',

    'bond.amount': '缴纳数量（{symbol}）',
    'bond.walletHint': '钱包余额：{amount} {symbol}',
    'bond.max': '最大',
    'bond.action': '缴纳保证金',
    'bond.approving': '第 1 步（共 2 步）：授权 {amount} {symbol} 用于保证金',
    'bond.sending': '第 2 步（共 2 步）：缴纳保证金',
    'bond.confirm': '请在钱包中确认…',
    'bond.success': '保证金已确认。',
    'bond.err.amount': '请输入大于零的数量（最多 {decimals} 位小数）。',
    'bond.err.balance': '超过了您的钱包余额。',
    'bond.err.minimum': '您的保证金总额仍将低于最低要求 {amount} {symbol}。',

    'bond.unbond': '开始解锁',
    'bond.unbondNote':
      '通过保证金授予的签发方角色会立即撤销，保证金在 {delay}后可提取。存在待处理的罚没提案时无法开始。',
    'bond.unbondSuccess': '已开始解锁。',
    'bond.withdraw': '提取保证金',
    'bond.withdrawNote': '解锁等待期结束且没有待处理的罚没提案后才可提取。',
    'bond.withdrawSuccess': '保证金已提取到您的钱包。',

    'slash.title': '存在待处理的罚没提案',
    'slash.intro':
      '有一个罚没提案针对您的保证金。在其被执行、取消或过期之前，解锁和提取将被冻结。',
    'slash.amount': '涉及金额',
    'slash.reason': '所述理由',
    'slash.noReason': '无法加载理由。',
    'slash.windowOpen': '异议期将在 {time}后结束（{date}）。在此之前无法执行。',
    'slash.windowClosed':
      '异议期已结束。未被异议的提案在 {date} 之前任何人都可以执行，之后将过期。',
    'slash.windowClosedDisputed':
      '异议期已结束。由于您提出了异议，只有罚没执行方才能在 {date} 之前执行，之后将过期。',
    'slash.disputed': '您已对该提案提出异议。',
    'slash.evidence': '证据（文字、链接或 0x… 32 字节哈希）',
    'slash.evidenceHint':
      '链上只保存哈希。文字或链接会在您的浏览器中计算 keccak-256 哈希；请将原件保存在审阅者可以查阅的地方。',
    'slash.dispute': '提出异议',
    'slash.disputeSuccess': '异议已记录。',
    'slash.err.evidence': '请填写要计算哈希的证据，或粘贴 0x… 32 字节哈希。',
    'slash.dest.burn': '被罚没的代币将被销毁。',
    'slash.dest.burnOrSink':
      '被罚没的代币：若代币支持销毁则销毁，否则转到罚没接收地址 {address}。执行后以链上事件为准。',
    'slash.dest.treasury': '被罚没的代币将转到罚没金库 {address}（不销毁）。',
    'slash.last.title': '最近一次罚没',
    'slash.last.burned': '{amount} {symbol} 已销毁。',
    'slash.last.sent': '{amount} {symbol} 已转到 {address}（未销毁）。',
  },
};
