import type { Messages } from '@/lib/i18n';

export const messages: Messages = {
  en: {
    'page.title': 'Retirement certificates',
    'page.subtitle':
      'Proof that carbon credits were permanently retired. Each certificate is rebuilt from the chain and can be verified by anyone with the transaction hash.',
    'actions.refresh': 'Refresh',
    'actions.retry': 'Try again',
    'actions.print': 'Print / Save as PDF',
    'actions.copyLink': 'Copy verification link',
    'actions.linkCopied': 'Verification link copied.',
    'actions.copyFailed': 'Could not copy to the clipboard.',
    'actions.explorer': 'View on explorer',
    'connect.title': 'Connect your wallet',
    'connect.description':
      'Connect your wallet to list your own retirement certificates. You can still verify any certificate with a transaction hash above.',
    'unconfigured.title': 'Contracts not configured',
    'unconfigured.description':
      'Set NEXT_PUBLIC_CARBON_CREDIT_NFT in .env.local and restart the dev server to read retirement certificates.',
    'errors.load': 'Could not load your retirements',
    'list.aria': 'Your retirement certificates',
    'list.noReason': 'No reason recorded',
    'list.truncated':
      'Only blocks from {from} onward were scanned (NEXT_PUBLIC_DEPLOY_BLOCK is not set), so older retirements may be missing. Any certificate can still be opened by its transaction hash.',
    'list.emptyTitle': 'No retirements yet',
    'list.emptyDescription':
      'Retire carbon credits from your Carbon Wallet and a certificate will appear here.',
    'list.emptyAction': 'Retire credits',
    'verifyBox.label': 'Verify a retirement by transaction hash',
    'verifyBox.action': 'Verify',
    'verifyBox.hint': 'Paste the 0x… hash of a retirement transaction.',
    'verifyBox.invalid':
      'A transaction hash is 0x followed by 64 hex characters.',
    'cert.aria': 'Retirement certificate {id}',
    'cert.title': 'Certificate of Carbon Credit Retirement',
    'cert.number': 'Certificate No. {id}',
    'cert.certifies': 'This certifies that',
    'cert.retired': 'has permanently retired',
    'cert.unit': 'tonnes CO₂e',
    'cert.purpose': 'Beneficiary statement (self-declared, unverified)',
    'cert.date': 'Retirement date',
    'cert.token': 'Credit token',
    'cert.block': 'Block',
    'cert.project': 'Project',
    'cert.methodology': 'Methodology',
    'cert.vintage': 'Vintage',
    'cert.geography': 'Geography',
    'cert.serial': 'Serial number',
    'cert.projectId': 'Project ID',
    'cert.tx': 'Transaction',
    'cert.verifyAt': 'Verify at',
    'cert.verified':
      'Retirement recorded onchain: the NFT contract’s stored record matches this retirement. This does not attest the underlying project.',
    'cert.unverified':
      'Not verified: the stored onchain record does not match this retirement.',
    'cert.unchecked':
      'Could not verify: the stored onchain record could not be read. Do not rely on this certificate.',
    'cert.unbacked':
      'Registration/demo credit: it carries no issuer serial number, so this proves only that a token was burned, not that a real tonne was offset.',
    'cert.testnet':
      'TESTNET credits: no real-world value and no real emissions offset.',
    'cert.disclaimer':
      'The credit NFT was burned in the transaction above, so it cannot be sold, transferred or retired again.',
    'verify.title': 'Verify a retirement',
    'verify.subtitle':
      'This page re-reads the transaction receipt from the configured Robinhood Chain network and rebuilds the certificate, so it does not depend on any server.',
    'verify.back': 'My certificates',
    'verify.errorTitle': 'Could not read the chain',
    'verify.okTitle': 'Retirement recorded onchain',
    'verify.ok':
      'A CreditRetired event from the Carbonized NFT contract was found in block {block} and matches the contract’s stored certificate. This proves the token was burned; it does not attest the underlying project or issuer.',
    'verify.mismatchTitle': 'Record mismatch',
    'verify.mismatch':
      'The event was found, but the contract’s stored certificate does not match it. Do not rely on this certificate.',
    'verify.uncheckedTitle': 'Could not verify',
    'verify.unchecked':
      'The retirement event was found, but the contract’s stored certificate could not be read (RPC error), so it was not cross-checked. Try again later and do not rely on this certificate until it verifies.',
    'verify.unbackedTitle': 'Registration / demo credit',
    'verify.unbacked':
      'This credit has no issuer serial number or real project behind it. The retirement is recorded onchain, but it must not be presented as a real-world offset.',
    'verify.testnetTitle': 'Testnet credits',
    'verify.testnet':
      'This certificate is on a test network. Testnet credits have no real-world value and do not represent real emissions reductions.',
    'verify.selectToken': 'Retired credits in this transaction',
    'verify.batch': 'This transaction retired {count} credits:',
    'verify.notFound.title': 'Transaction not found',
    'verify.notFound.description':
      'No receipt exists for this hash on the configured chain. Check the hash, or wait for the transaction to be mined.',
    'verify.reverted.title': 'Transaction failed',
    'verify.reverted.description':
      'This transaction was reverted onchain, so nothing was retired.',
    'verify.notRetirement.title': 'Not a retirement',
    'verify.notRetirement.description':
      'This transaction did not retire any credit from the Carbonized NFT contract.',
    'verify.badHash.title': 'Invalid transaction hash',
    'verify.badHash.description':
      'A transaction hash is 0x followed by 64 hexadecimal characters.',
  },
  zh: {
    'page.title': '注销证书',
    'page.subtitle':
      '碳信用已被永久注销的证明。每份证书均从链上重建，任何人都可凭交易哈希进行验证。',
    'actions.refresh': '刷新',
    'actions.retry': '重试',
    'actions.print': '打印 / 另存为 PDF',
    'actions.copyLink': '复制验证链接',
    'actions.linkCopied': '验证链接已复制。',
    'actions.copyFailed': '无法复制到剪贴板。',
    'actions.explorer': '在浏览器中查看',
    'connect.title': '连接您的钱包',
    'connect.description':
      '连接钱包以列出您自己的注销证书。您仍可通过上方的交易哈希验证任何证书。',
    'unconfigured.title': '合约未配置',
    'unconfigured.description':
      '请在 .env.local 中设置 NEXT_PUBLIC_CARBON_CREDIT_NFT 并重启开发服务器，以读取注销证书。',
    'errors.load': '无法加载您的注销记录',
    'list.aria': '您的注销证书',
    'list.noReason': '未记录原因',
    'list.truncated':
      '仅扫描了区块 {from} 之后的数据（未设置 NEXT_PUBLIC_DEPLOY_BLOCK），因此可能缺少较早的注销记录。任何证书仍可通过其交易哈希打开。',
    'list.emptyTitle': '暂无注销记录',
    'list.emptyDescription': '在您的碳钱包中注销碳信用后，证书将显示在此处。',
    'list.emptyAction': '注销碳信用',
    'verifyBox.label': '通过交易哈希验证注销',
    'verifyBox.action': '验证',
    'verifyBox.hint': '粘贴注销交易的 0x… 哈希。',
    'verifyBox.invalid': '交易哈希为 0x 后跟 64 个十六进制字符。',
    'cert.aria': '注销证书 {id}',
    'cert.title': '碳信用注销证书',
    'cert.number': '证书编号 {id}',
    'cert.certifies': '兹证明',
    'cert.retired': '已永久注销',
    'cert.unit': '吨 CO₂e',
    'cert.purpose': '受益人声明(自行填写,未经核实)',
    'cert.date': '注销日期',
    'cert.token': '碳信用代币',
    'cert.block': '区块',
    'cert.project': '项目',
    'cert.methodology': '方法学',
    'cert.vintage': '碳信用年份',
    'cert.geography': '地区',
    'cert.serial': '序列号',
    'cert.projectId': '项目 ID',
    'cert.tx': '交易',
    'cert.verifyAt': '验证地址',
    'cert.verified':
      '已在链上记录注销:NFT 合约存储的记录与此次注销一致。这并不证明底层项目的真实性。',
    'cert.unverified': '未验证:链上存储的记录与此次注销不一致。',
    'cert.unchecked': '无法验证:无法读取链上存储的记录。请勿依赖此证书。',
    'cert.unbacked':
      '注册/演示碳信用:没有签发机构序列号,仅证明一枚代币被销毁,并不代表真实抵消了一吨排放。',
    'cert.testnet': '测试网碳信用:无任何现实价值,也不代表真实减排。',
    'cert.disclaimer':
      '碳信用 NFT 已在上述交易中销毁，因此无法再次出售、转让或注销。',
    'verify.title': '验证注销',
    'verify.subtitle':
      '此页面会从已配置的 Robinhood Chain 网络重新读取交易回执并重建证书,因此不依赖任何服务器。',
    'verify.back': '我的证书',
    'verify.errorTitle': '无法读取区块链',
    'verify.okTitle': '注销已在链上记录',
    'verify.ok':
      '在区块 {block} 中发现了来自 Carbonized NFT 合约的 CreditRetired 事件,并与合约存储的证书一致。这证明代币已被销毁,但不证明底层项目或签发机构。',
    'verify.mismatchTitle': '记录不一致',
    'verify.mismatch':
      '已找到该事件,但合约存储的证书与其不一致。请勿依赖此证书。',
    'verify.uncheckedTitle': '无法验证',
    'verify.unchecked':
      '已找到注销事件,但无法读取合约存储的证书(RPC 错误),因此未进行交叉核对。请稍后重试,在验证通过前请勿依赖此证书。',
    'verify.unbackedTitle': '注册/演示碳信用',
    'verify.unbacked':
      '该碳信用没有签发机构序列号,也没有真实项目支撑。注销已在链上记录,但不得被当作真实的现实世界抵消。',
    'verify.testnetTitle': '测试网碳信用',
    'verify.testnet':
      '此证书位于测试网。测试网碳信用无任何现实价值,也不代表真实减排。',
    'verify.selectToken': '此交易中注销的碳信用',
    'verify.batch': '此交易注销了 {count} 个碳信用：',
    'verify.notFound.title': '未找到交易',
    'verify.notFound.description':
      '在配置的链上不存在此哈希的回执。请检查哈希，或等待交易被打包。',
    'verify.reverted.title': '交易失败',
    'verify.reverted.description': '此交易已在链上回滚，因此未注销任何内容。',
    'verify.notRetirement.title': '并非注销交易',
    'verify.notRetirement.description':
      '此交易未注销 Carbonized NFT 合约中的任何碳信用。',
    'verify.badHash.title': '交易哈希无效',
    'verify.badHash.description': '交易哈希为 0x 后跟 64 个十六进制字符。',
  },
};
