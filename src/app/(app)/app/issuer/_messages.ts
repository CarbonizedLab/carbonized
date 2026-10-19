import type { Messages } from '@/lib/i18n';

export const messages: Messages = {
  en: {
    'page.title': 'Issuer',
    'page.description':
      'Credits are created only by approved issuers. This page explains how issuers work, lists the current ones and, for issuer wallets, lets them issue credits.',
    'page.docs': 'Issuer guide',

    'status.title': 'Your wallet',
    'status.noWallet': 'No wallet connected',
    'status.notConfigured': 'Carbon credit NFT not configured',
    'status.notConfiguredDesc':
      'NEXT_PUBLIC_CARBON_CREDIT_NFT is not set, so roles cannot be read.',
    'status.notConnected': 'Connect a wallet',
    'status.notConnectedDesc':
      'Connect your wallet to see whether it holds the issuer role. The information below is public.',
    'status.failed': 'Could not read the role from the chain. Try again later.',
    'status.issuer': 'This wallet is an approved issuer',
    'status.issuerDesc':
      'You can issue credits below. Every issuance is permanent, public and attributed to this wallet.',
    'status.paused':
      'The NFT contract is paused: minting reverts until it is unpaused.',
    'status.notIssuer': 'This wallet is not an issuer',
    'status.notIssuerDesc':
      'You can browse everything here. Issuing credits is limited to approved issuers, so the forms stay locked for now.',
    'status.admin': 'Admin: can grant and revoke NATIVE_ISSUER_ROLE',

    'apply.title': 'How to become an issuer',
    'apply.step1':
      'Prepare evidence for the credits you want to issue: the external registry serial numbers and the verification report or retirement/ownership proof for each.',
    'apply.step2':
      'Ask the Carbonized operator to review your application (see the issuer guide for the checklist). Use a multisig wallet address, not a personal key.',
    'apply.step3':
      'Once approved, your wallet is added as an issuer and appears in the public issuer list on this page.',
    'apply.docs': 'Read the issuer guide',

    'info.title': 'What the issuer role is',
    'info.description':
      'Issuers are trusted parties; the contract is not a verifier.',
    'info.p1':
      'Only approved issuers can create credits. There is no public mint, faucet or starter pack.',
    'info.p2':
      'Each credit needs a non-empty registry serial, a non-zero evidence/oracle proof hash, 1 to 10,000,000 tonnes and a vintage between 2015 and 2050. One serial can be tokenized once, ever.',
    'info.p3':
      'Credits can be retired (burned) or transferred, and can be wrapped into a pooled CCT only when they carry a serial and a proof hash and match the pool methodology.',
    'info.p4':
      'The contract checks formats and uniqueness, not facts. It never contacts a registry or an oracle.',
    'info.trust':
      'Trust model: a credit is only as trustworthy as the issuer that created it. Carbonized makes no claim that issued credits are approved by any registry or regulator. Check who issued a credit, its evidence hash and its serial before you buy.',
    'info.docs': 'Issuer onboarding policy',

    'directory.title': 'Public issuer list',
    'directory.description':
      'Wallets that are currently approved to issue credits, rebuilt from public onchain records.',
    'directory.error': 'Could not load the issuer list.',
    'directory.empty': 'No wallet is approved to issue credits yet.',
    'directory.verifier': 'Emission verifier contract',
    'directory.you': 'You',
    'directory.since': 'since block {block}',
    'directory.partial':
      'This list only covers recent activity, so earlier issuers may be missing.',

    'issue.title': 'Issue credits',
    'issue.description':
      'Each credit becomes one NFT carrying the registry serial and your evidence hash. Nothing can be edited after minting.',
    'issue.disabledNote':
      'Issuing credits is limited to approved issuers, and this wallet is not approved yet. Follow the steps in "How to become an issuer" to apply.',
    'issue.pausedNote':
      'The NFT contract is paused, so issuance is disabled until it is unpaused.',
    'tabs.single': 'Single credit',
    'tabs.batch': 'Batch (CSV)',

    'f.recipient': 'Recipient address',
    'f.methodology': 'Methodology',
    'f.projectId': 'Project ID',
    'f.projectName': 'Project name',
    'f.serial': 'Registry serial number',
    'f.tonnes': 'CO2 tonnes',
    'f.vintage': 'Vintage year',
    'f.geography': 'Geography',
    'f.proof': 'Evidence / oracle proof hash (bytes32)',
    'f.cid': 'Satellite data CID (optional)',
    'f.uri': 'Metadata URL (tokenURI)',

    'h.methodology':
      'Only an exact methodology match can be wrapped into that CCT pool.',
    'h.projectId': 'Your stable identifier for the project.',
    'h.serial':
      'Serial exactly as the external registry shows it. Matching ignores case and surrounding spaces; one serial can be tokenized once.',
    'h.tonnes': 'Whole tonnes, 1 to {max}.',
    'h.geography': 'Country code, for example BR.',
    'h.proof':
      'SHA-256 of your evidence (verification report, retirement proof). Must not be all zeros.',
    'h.cid': 'IPFS CID of satellite or monitoring data, if any.',
    'h.uri': 'ipfs://, https:// or ar:// link to the credit metadata JSON.',

    'err.required': 'Required.',
    'err.methodology': 'Choose ICM_COMPLIANCE, VERRA_VCS or GOLD_STANDARD.',
    'err.tonnes': 'Enter a whole number from 1 to {max}.',
    'err.vintage': 'Enter a year from {minYear} to {maxYear}.',
    'err.hash': 'Must be 0x followed by 64 hex characters.',
    'err.zeroHash': 'The proof hash cannot be all zeros.',
    'err.uri': 'Must start with ipfs://, https:// or ar:// and have no spaces.',
    'err.cid': 'Must not contain spaces.',
    'err.address': 'Enter a valid, non-zero 0x address.',

    'serial.canonical': 'Canonical form: {key}',
    'serial.checking': 'checking onchain…',
    'serial.free': 'not tokenized yet',
    'serial.taken': 'already tokenized: this serial cannot be issued again',
    'serial.error': 'could not check onchain',

    'evidence.button': 'Hash evidence file',
    'evidence.hashing': 'Hashing…',
    'evidence.note':
      'Computes SHA-256 in your browser and fills the field. The file is never uploaded; keep it, you may be asked for it.',
    'evidence.done': 'SHA-256 of {name} ({kib} KiB), computed locally.',
    'evidence.failed': 'Could not hash the file.',

    'common.wrongNetwork':
      'Your wallet is on a different network than this deployment. Switch network to continue.',
    'common.viewTx': 'View transaction',

    'single.title': 'Issue a single credit',
    'single.recipientHint': 'The wallet that receives the NFT.',
    'single.useMine': 'Use mine',
    'single.confirm':
      'I confirm the serial and evidence belong to this credit, that it has not been issued elsewhere, and that I understand minting is permanent.',
    'single.submit': 'Issue credit',
    'single.signing': 'Confirm in wallet…',
    'single.confirming': 'Waiting for confirmation…',
    'single.success': 'Credit issued.',
    'single.failed': 'Issuance failed.',
    'single.issued': 'Issued NFT #{id}.',
    'single.issuedNoId': 'Credit issued.',

    'batch.title': 'Issue credits in batch',
    'batch.recipientHint':
      'All credits in the CSV go to this wallet. Credits are grouped by project ID.',
    'batch.csv': 'Credits (CSV or tab-separated)',
    'batch.template': 'Download template',
    'batch.upload': 'Upload CSV',
    'batch.csvNote':
      'Columns: projectId, projectName, serialNumber, methodology, tonnes, vintageYear, geography, oracleProofHash, satelliteDataCID (optional), tokenURI. Sent in transactions of at most {max} credits.',
    'batch.missingColumns': 'Missing required columns: {columns}.',
    'batch.unknownColumns': 'Ignored columns: {columns}.',
    'batch.preview': 'Validation preview ({count} rows)',
    'batch.col.line': 'Line',
    'batch.col.status': 'Status',
    'batch.col.tx': 'Tx',
    'batch.col.credits': 'Credits',
    'batch.col.result': 'Result',
    'batch.moreRows': '…and {count} more rows (all are validated).',
    'batch.plan': '{txs} transaction(s), {credits} credits, {tonnes} t CO2',
    'batch.tokenIds': 'NFT ids: {ids}',
    'batch.gasNote':
      'Each transaction is signed separately and costs roughly 0.5M gas per credit. Progress is saved in this browser: if a transaction fails or you close the page, paste the same CSV again and resume.',
    'batch.fixRows':
      'Fix the rows marked in red (or remove them) before issuing. Rows are never skipped silently.',
    'batch.stop': 'Stop after current',
    'batch.clearProgress': 'Clear saved progress',
    'batch.running': 'Issuing…',
    'batch.resume': 'Resume ({count} transaction(s) left)',
    'batch.start': 'Issue {count} transaction(s)',
    'batch.alreadyTokenized': 'Already tokenized onchain: {serials}.',
    'batch.chunkFailed': 'Transaction failed.',
    'batch.allDone': 'All batches issued.',
    'batch.dupInFile': 'Serial repeated (first on line {line})',
    'batch.row.issued': 'Issued',
    'batch.row.free': 'Ready',
    'batch.row.taken': 'Already tokenized',
    'batch.row.error': 'Check failed',
    'batch.row.checking': 'Checking…',
    'chunk.pending': 'Pending',
    'chunk.signing': 'Awaiting wallet',
    'chunk.confirming': 'Confirming',
    'chunk.done': 'Confirmed',
    'chunk.failed': 'Failed',

    'recent.title': 'Recently issued credits',
    'recent.description':
      'Read from CreditMinted and CreditBatchMinted events. Filter by the wallet that received the credits.',
    'recent.filter': 'Filter by recipient',
    'recent.mine': 'My wallet',
    'recent.clear': 'Clear',
    'recent.refresh': 'Refresh',
    'recent.error': 'Could not load issued credits.',
    'recent.empty': 'No issued credits found',
    'recent.emptyDesc':
      'Nothing has been issued in the scanned block range for this filter.',
    'recent.col.token': 'NFT',
    'recent.col.project': 'Project',
    'recent.col.recipient': 'Recipient',
    'recent.col.issuer': 'Issuer',
    'recent.col.date': 'Issued',
    'recent.batch': 'batch of {count}',
    'recent.retired': 'Retired',
    'recent.noProof': 'No proof',
    'recent.showing': 'Showing the latest {shown} of {total} (max {limit}).',
    'recent.partialHistory':
      'Only a recent block window was scanned; set NEXT_PUBLIC_DEPLOY_BLOCK for full history.',

    'admin.title': 'Manage issuers',
    'admin.description':
      'Admin only: grant or revoke NATIVE_ISSUER_ROLE on the carbon credit NFT.',
    'admin.warnMainnet':
      'Mainnet: grant the role only to a multisig (Safe) address, never to a personal wallet. An issuer can create credits that are traded as real carbon credits.',
    'admin.warnTestnet':
      'Use a multisig address for any real deployment. On testnet a single key is accepted, on mainnet it needs explicit confirmation.',
    'admin.target': 'Address',
    'admin.targetHint': 'Address to grant or revoke NATIVE_ISSUER_ROLE for.',
    'admin.checking': 'Checking the address…',
    'admin.lookupFailed': 'Could not read the address from the chain.',
    'admin.holds': 'Currently holds NATIVE_ISSUER_ROLE',
    'admin.holdsNot': 'Does not hold NATIVE_ISSUER_ROLE',
    'admin.kindContract': 'smart contract (multisig or smart account)',
    'admin.kindKey': 'plain key (externally-owned account)',
    'admin.singleKey':
      'This address is a single key, not a contract. A lost or stolen key means unlimited credit issuance.',
    'admin.ackSingleKey':
      'I understand this is a single key and still want to grant issuer rights.',
    'admin.selfWarning':
      'This is your own address. Revoking removes your issuing rights (admin rights stay).',
    'admin.grant': 'Grant NATIVE_ISSUER_ROLE',
    'admin.revoke': 'Revoke NATIVE_ISSUER_ROLE',
    'admin.sending': 'Sending…',
    'admin.granted': 'NATIVE_ISSUER_ROLE granted.',
    'admin.revoked': 'NATIVE_ISSUER_ROLE revoked.',
    'admin.failed': 'Role change failed.',
  },
  zh: {
    'page.title': '签发方',
    'page.description':
      '只有获批的签发方才能创建碳信用。本页说明签发方机制、列出当前签发方，并为签发方钱包提供签发功能。',
    'page.docs': '签发方指南',

    'status.title': '您的钱包',
    'status.noWallet': '未连接钱包',
    'status.notConfigured': '未配置碳信用 NFT',
    'status.notConfiguredDesc':
      '未设置 NEXT_PUBLIC_CARBON_CREDIT_NFT，因此无法读取角色。',
    'status.notConnected': '请连接钱包',
    'status.notConnectedDesc':
      '连接钱包以查看其是否持有签发方角色。以下信息均为公开信息。',
    'status.failed': '无法从链上读取角色，请稍后重试。',
    'status.issuer': '此钱包是获批签发方',
    'status.issuerDesc':
      '您可以在下方签发碳信用。每次签发都是永久、公开的，并记录在此钱包名下。',
    'status.paused': 'NFT 合约已暂停：在取消暂停之前，铸造会失败。',
    'status.notIssuer': '此钱包不是签发方',
    'status.notIssuerDesc': '您可以浏览本页的全部内容，但签发表单保持禁用。',
    'status.admin': '管理员：可授予和撤销 NATIVE_ISSUER_ROLE',

    'apply.title': '如何成为签发方',
    'apply.step1':
      '准备要签发的碳信用的证据：外部注册表序列号，以及每笔信用的核证报告或注销/所有权证明。',
    'apply.step2':
      '请 Carbonized 运营方审核您的申请（清单见签发方指南）。请使用多签钱包地址，而不是个人密钥。',
    'apply.step3':
      '审核通过后，您的钱包会被加入签发方，并出现在本页的公开签发方列表中。',
    'apply.docs': '阅读签发方指南',

    'info.title': '签发方角色是什么',
    'info.description': '签发方是受信任的一方；合约本身不是核证机构。',
    'info.p1':
      '只有获批的签发方可以创建碳信用。不存在公开铸造、水龙头或新手礼包。',
    'info.p2':
      '每笔信用都需要非空的注册表序列号、非零的证据/预言机证明哈希、1 至 10,000,000 吨以及 2015 至 2050 之间的年份。同一序列号永远只能被代币化一次。',
    'info.p3':
      '碳信用可以注销（销毁）或转让；只有带有序列号和证明哈希、且方法学与池匹配的碳信用才能封装为 CCT。',
    'info.p4':
      '合约只检查格式和唯一性，不核实事实，也不会联系任何注册表或预言机。',
    'info.trust':
      '信任模型：碳信用的可信度取决于创建它的签发方。Carbonized 不声称已签发的碳信用获得任何注册表或监管机构的批准。购买前请核查签发方、证据哈希和序列号。',
    'info.docs': '签发方准入政策',

    'directory.title': '公开签发方列表',
    'directory.description':
      '当前获批签发的钱包，根据公开链上记录重建。',
    'directory.error': '无法加载签发方列表。',
    'directory.empty': '目前还没有获批的签发钱包。',
    'directory.verifier': '排放验证合约',
    'directory.you': '您',
    'directory.since': '自区块 {block}',
    'directory.partial':
      '此列表仅涵盖近期活动，较早的签发方可能未显示。',

    'issue.title': '签发碳信用',
    'issue.description':
      '每笔碳信用对应一个 NFT，包含注册表序列号和您的证据哈希。铸造后无法修改。',
    'issue.disabledNote':
      '签发仅限获批的签发方，当前钱包尚未获批。请按“如何成为签发方”中的步骤申请。',
    'issue.pausedNote': 'NFT 合约已暂停，取消暂停之前无法签发。',
    'tabs.single': '单笔信用',
    'tabs.batch': '批量（CSV）',

    'f.recipient': '接收地址',
    'f.methodology': '方法学',
    'f.projectId': '项目 ID',
    'f.projectName': '项目名称',
    'f.serial': '注册表序列号',
    'f.tonnes': '二氧化碳吨数',
    'f.vintage': '年份',
    'f.geography': '地区',
    'f.proof': '证据/预言机证明哈希（bytes32）',
    'f.cid': '卫星数据 CID（可选）',
    'f.uri': '元数据链接（tokenURI）',

    'h.methodology': '只有方法学完全一致的碳信用才能封装进对应的 CCT 池。',
    'h.projectId': '您为该项目使用的固定标识。',
    'h.serial':
      '请按外部注册表显示的原样填写。比较时忽略大小写和首尾空格；同一序列号只能被代币化一次。',
    'h.tonnes': '整数吨，1 至 {max}。',
    'h.geography': '国家代码，例如 BR。',
    'h.proof': '证据（核证报告、注销证明）的 SHA-256。不能全为零。',
    'h.cid': '卫星或监测数据的 IPFS CID（如有）。',
    'h.uri': '指向碳信用元数据 JSON 的 ipfs://、https:// 或 ar:// 链接。',

    'err.required': '必填。',
    'err.methodology': '请选择 ICM_COMPLIANCE、VERRA_VCS 或 GOLD_STANDARD。',
    'err.tonnes': '请输入 1 至 {max} 之间的整数。',
    'err.vintage': '请输入 {minYear} 至 {maxYear} 之间的年份。',
    'err.hash': '必须是 0x 加 64 位十六进制字符。',
    'err.zeroHash': '证明哈希不能全为零。',
    'err.uri': '必须以 ipfs://、https:// 或 ar:// 开头且不含空格。',
    'err.cid': '不能包含空格。',
    'err.address': '请输入有效且非零的 0x 地址。',

    'serial.canonical': '规范化形式：{key}',
    'serial.checking': '正在链上检查…',
    'serial.free': '尚未被代币化',
    'serial.taken': '已被代币化：该序列号不能再次签发',
    'serial.error': '无法在链上检查',

    'evidence.button': '计算证据文件哈希',
    'evidence.hashing': '计算中…',
    'evidence.note':
      '在浏览器中计算 SHA-256 并填入该字段。文件不会被上传；请妥善保管，可能会被要求提供。',
    'evidence.done': '{name}（{kib} KiB）的 SHA-256，已在本地计算。',
    'evidence.failed': '无法计算文件哈希。',

    'common.wrongNetwork': '您的钱包所在网络与本部署不一致，请切换网络后继续。',
    'common.viewTx': '查看交易',

    'single.title': '签发单笔碳信用',
    'single.recipientHint': '接收该 NFT 的钱包。',
    'single.useMine': '使用我的地址',
    'single.confirm':
      '我确认该序列号和证据属于此碳信用，它没有在其他地方签发过，并且我了解铸造是永久性的。',
    'single.submit': '签发碳信用',
    'single.signing': '请在钱包中确认…',
    'single.confirming': '等待确认…',
    'single.success': '碳信用已签发。',
    'single.failed': '签发失败。',
    'single.issued': '已签发 NFT #{id}。',
    'single.issuedNoId': '碳信用已签发。',

    'batch.title': '批量签发碳信用',
    'batch.recipientHint':
      'CSV 中的所有碳信用都发送到此钱包。碳信用按项目 ID 分组。',
    'batch.csv': '碳信用（CSV 或制表符分隔）',
    'batch.template': '下载模板',
    'batch.upload': '上传 CSV',
    'batch.csvNote':
      '列：projectId、projectName、serialNumber、methodology、tonnes、vintageYear、geography、oracleProofHash、satelliteDataCID（可选）、tokenURI。每笔交易最多 {max} 个碳信用。',
    'batch.missingColumns': '缺少必需的列：{columns}。',
    'batch.unknownColumns': '已忽略的列：{columns}。',
    'batch.preview': '校验预览（{count} 行）',
    'batch.col.line': '行',
    'batch.col.status': '状态',
    'batch.col.tx': '交易',
    'batch.col.credits': '碳信用数',
    'batch.col.result': '结果',
    'batch.moreRows': '…另有 {count} 行（均已校验）。',
    'batch.plan': '{txs} 笔交易，{credits} 个碳信用，{tonnes} 吨二氧化碳',
    'batch.tokenIds': 'NFT 编号：{ids}',
    'batch.gasNote':
      '每笔交易单独签名，每个碳信用约需 50 万 gas。进度保存在此浏览器中：如果交易失败或关闭页面，重新粘贴相同的 CSV 即可继续。',
    'batch.fixRows': '请先修正（或删除）标红的行再签发。不会静默跳过任何行。',
    'batch.stop': '当前交易后停止',
    'batch.clearProgress': '清除已保存的进度',
    'batch.running': '签发中…',
    'batch.resume': '继续（剩余 {count} 笔交易）',
    'batch.start': '签发 {count} 笔交易',
    'batch.alreadyTokenized': '链上已被代币化：{serials}。',
    'batch.chunkFailed': '交易失败。',
    'batch.allDone': '所有批次均已签发。',
    'batch.dupInFile': '序列号重复（首次出现在第 {line} 行）',
    'batch.row.issued': '已签发',
    'batch.row.free': '就绪',
    'batch.row.taken': '已被代币化',
    'batch.row.error': '检查失败',
    'batch.row.checking': '检查中…',
    'chunk.pending': '待处理',
    'chunk.signing': '等待钱包',
    'chunk.confirming': '确认中',
    'chunk.done': '已确认',
    'chunk.failed': '失败',

    'recent.title': '最近签发的碳信用',
    'recent.description':
      '读取自 CreditMinted 和 CreditBatchMinted 事件。可按接收碳信用的钱包筛选。',
    'recent.filter': '按接收方筛选',
    'recent.mine': '我的钱包',
    'recent.clear': '清除',
    'recent.refresh': '刷新',
    'recent.error': '无法加载已签发的碳信用。',
    'recent.empty': '未找到已签发的碳信用',
    'recent.emptyDesc': '在已扫描的区块范围内，此筛选条件下没有签发记录。',
    'recent.col.token': 'NFT',
    'recent.col.project': '项目',
    'recent.col.recipient': '接收方',
    'recent.col.issuer': '签发方',
    'recent.col.date': '签发时间',
    'recent.batch': '批次共 {count} 个',
    'recent.retired': '已注销',
    'recent.noProof': '无证明',
    'recent.showing': '显示最新 {shown} 个，共 {total} 个（上限 {limit}）。',
    'recent.partialHistory':
      '仅扫描了最近的区块范围；设置 NEXT_PUBLIC_DEPLOY_BLOCK 可查看完整历史。',

    'admin.title': '管理签发方',
    'admin.description':
      '仅限管理员：在碳信用 NFT 上授予或撤销 NATIVE_ISSUER_ROLE。',
    'admin.warnMainnet':
      '主网：只能把该角色授予多签（Safe）地址，绝不能授予个人钱包。签发方创建的碳信用会作为真实碳信用被交易。',
    'admin.warnTestnet':
      '任何真实部署都请使用多签地址。测试网接受单个密钥，主网则需要明确确认。',
    'admin.target': '地址',
    'admin.targetHint': '要授予或撤销 NATIVE_ISSUER_ROLE 的地址。',
    'admin.checking': '正在检查地址…',
    'admin.lookupFailed': '无法从链上读取该地址。',
    'admin.holds': '当前持有 NATIVE_ISSUER_ROLE',
    'admin.holdsNot': '不持有 NATIVE_ISSUER_ROLE',
    'admin.kindContract': '智能合约（多签或智能账户）',
    'admin.kindKey': '普通密钥（外部拥有账户）',
    'admin.singleKey':
      '该地址是单个密钥，而不是合约。密钥丢失或被盗意味着可以无限签发碳信用。',
    'admin.ackSingleKey': '我了解这是单个密钥，仍然要授予签发权限。',
    'admin.selfWarning':
      '这是您自己的地址。撤销将移除您的签发权限（管理员权限保留）。',
    'admin.grant': '授予 NATIVE_ISSUER_ROLE',
    'admin.revoke': '撤销 NATIVE_ISSUER_ROLE',
    'admin.sending': '发送中…',
    'admin.granted': '已授予 NATIVE_ISSUER_ROLE。',
    'admin.revoked': '已撤销 NATIVE_ISSUER_ROLE。',
    'admin.failed': '角色变更失败。',
  },
};
