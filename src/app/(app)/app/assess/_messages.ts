import type { Messages } from '@/lib/i18n';

export const messages: Messages = {
  en: {
    'page.title': 'Credit assessment',
    'page.description':
      'Check your ISO 14064 readiness, review your credits by registry standard and decide how many to retire, reserve or sell against this year’s emissions.',
    'page.year': 'Year',

    'empty.title': 'Connect your wallet',
    'empty.description':
      'The assessment reads your NFT credits and your emission inventory. Connect a wallet to continue.',

    'unit.tco2e': 'tCO₂e',

    'kpi.eligible': 'Eligible credits',
    'kpi.eligibleHint': 'Non-retired NFT credits in your wallet',
    'kpi.emissions': 'Emissions {year}',
    'kpi.emissionsHint': 'From {count} tracker record(s)',
    'kpi.coverage': 'Offset coverage',
    'kpi.coverageHint': 'Emissions covered by eligible credits',
    'kpi.coverageNone': 'Log emissions in the tracker first',
    'kpi.sellable': 'Sellable surplus',
    'kpi.sellableHint': 'After offset and reserve',

    'iso.title': 'ISO 14064 readiness',
    'iso.description':
      'A self-assessment checklist for a GHG inventory. It is stored in this browser and is not a certification.',
    'iso.ready': 'Ready for verification',
    'iso.inProgress': 'In progress',
    'iso.progress': '{done} of {total} steps complete',
    'iso.progressLabel': 'ISO 14064 readiness progress',
    'iso.auto': 'Auto-detected',
    'iso.storage':
      'Progress is saved locally for your wallet. Store the verification document hash from your auditor (SHA-256 / keccak hex or an IPFS CID).',
    'iso.boundary.title': 'Inventory boundary defined',
    'iso.boundary.hint':
      'Organizational boundary (equity share or control) and operational boundary (Scope 1, 2 and relevant Scope 3).',
    'iso.baseYear.title': 'Base year set',
    'iso.baseYear.hint':
      'A representative year used to track emission changes over time.',
    'iso.baseYear.field': 'Base year',
    'iso.baseYear.error': 'Enter a four-digit year between 1990 and {max}.',
    'iso.sources.title': 'Emission sources quantified',
    'iso.sources.hint':
      'Activity data collected and converted with documented emission factors. Detected automatically when the tracker has records.',
    'iso.dataQuality.title': 'Data quality and uncertainty documented',
    'iso.dataQuality.hint':
      'Sources of activity data, factor references and known uncertainties are recorded.',
    'iso.report.title': 'GHG inventory report prepared',
    'iso.report.hint':
      'A report covering boundaries, quantification methods, results and the base year.',
    'iso.verification.title': 'Verified by a third party',
    'iso.verification.hint':
      'An independent verifier has reviewed the inventory. Provide the details below.',
    'iso.verification.auditor': 'Auditor / verification body',
    'iso.verification.auditorPlaceholder': 'e.g. Accredited verifier name',
    'iso.verification.auditorError': 'Enter the auditor name.',
    'iso.verification.date': 'Verification date',
    'iso.verification.dateError': 'Select the verification date.',
    'iso.verification.hash': 'Verification document hash',
    'iso.verification.hashError':
      'Use a 0x-prefixed 64-character hex hash or an IPFS CID (Qm… / bafy…).',

    'registry.title': 'Credits by registry standard',
    'registry.description':
      'Your NFT carbon credits grouped by methodology, split into eligible and retired tonnes.',
    'registry.notConfigured':
      'The Carbon Credit NFT contract is not configured, so credits cannot be read.',
    'registry.empty':
      'No NFT credits in this wallet yet. Claim demo credits from your company page or tokenize credits first.',
    'registry.credits': '{count} credit(s)',
    'registry.eligible': 'Eligible',
    'registry.retired': 'Retired',
    'registry.total': 'Total',
    'registry.eligibleShort': 'eligible',
    'registry.retiredShort': 'retired',

    'calc.title': 'Surplus allocation calculator',
    'calc.description':
      'Compare eligible credits with your {year} emissions to plan how many tonnes to retire, keep in reserve and sell.',
    'calc.offset': 'Retire to offset',
    'calc.offsetHint': 'Internal offset needed: {need} tCO₂e',
    'calc.reserve': 'Reserve',
    'calc.reserveHint': 'Holding back {pct}% of the surplus',
    'calc.sellable': 'Sellable surplus',
    'calc.sellableHint': 'Can be wrapped and listed on the market',
    'calc.shortfall': 'Shortfall',
    'calc.shortfallHint': 'Emissions not covered; buy more credits',
    'calc.sliderLabel': 'Reserve extra surplus',
    'calc.sliderValue': '{pct}% of surplus, {tonnes}',
    'calc.sliderHelp':
      'Hold back part of the surplus for future years or a safety buffer.',
    'calc.noSurplus':
      'No surplus available: eligible credits do not exceed your emissions.',
    'calc.ctaRetire': 'Retire credits',
    'calc.ctaWrap': 'Tokenize / wrap',
    'calc.ctaSell': 'Sell surplus',
    'calc.ctaHint':
      'Retire credits in your carbon wallet, wrap sellable tonnes into pooled tokens, then list them for sale.',

    'chart.emissions': 'Emissions',
    'chart.credits': 'Credits',
    'chart.offset': 'Offset',
    'chart.reserve': 'Reserve',
    'chart.sellable': 'Sellable',
    'chart.shortfall': 'Shortfall',
    'chart.coverage': 'offset coverage',
    'chart.donutAria':
      'Donut chart of credit allocation. Offset coverage {pct}.',
    'chart.barAria':
      'Stacked bar chart comparing emissions with credit allocation.',

    'toast.storageFailed':
      'Could not save to browser storage. Your changes may be lost on reload.',
  },
  zh: {
    'page.title': '碳信用评估',
    'page.description':
      '检查您的 ISO 14064 就绪情况，按注册机构标准查看您的碳信用，并决定针对今年的排放量注销、保留或出售多少。',
    'page.year': '年份',

    'empty.title': '连接您的钱包',
    'empty.description':
      '评估会读取您的 NFT 碳信用和排放清单。请连接钱包以继续。',

    'unit.tco2e': 'tCO₂e',

    'kpi.eligible': '合格碳信用',
    'kpi.eligibleHint': '您钱包中未注销的 NFT 碳信用',
    'kpi.emissions': '{year} 年排放量',
    'kpi.emissionsHint': '来自 {count} 条追踪记录',
    'kpi.coverage': '抵消覆盖率',
    'kpi.coverageHint': '合格碳信用所覆盖的排放量',
    'kpi.coverageNone': '请先在追踪器中记录排放',
    'kpi.sellable': '可售盈余',
    'kpi.sellableHint': '扣除抵消和保留后',

    'iso.title': 'ISO 14064 就绪情况',
    'iso.description':
      '温室气体清单的自我评估清单。数据存储在此浏览器中，不构成认证。',
    'iso.ready': '可进行核查',
    'iso.inProgress': '进行中',
    'iso.progress': '已完成 {done}/{total} 个步骤',
    'iso.progressLabel': 'ISO 14064 就绪进度',
    'iso.auto': '自动检测',
    'iso.storage':
      '进度会在本地为您的钱包保存。请存储审计方提供的核查文件哈希（SHA-256 / keccak 十六进制或 IPFS CID）。',
    'iso.boundary.title': '已确定清单边界',
    'iso.boundary.hint':
      '组织边界（股权比例或控制权）和运营边界（范围 1、范围 2 及相关的范围 3）。',
    'iso.baseYear.title': '已设定基准年',
    'iso.baseYear.hint': '用于跟踪排放量长期变化的代表性年份。',
    'iso.baseYear.field': '基准年',
    'iso.baseYear.error': '请输入 1990 至 {max} 之间的四位数年份。',
    'iso.sources.title': '已量化排放源',
    'iso.sources.hint':
      '已收集活动数据并使用有据可查的排放因子进行换算。当追踪器中有记录时会自动检测。',
    'iso.dataQuality.title': '已记录数据质量和不确定性',
    'iso.dataQuality.hint':
      '已记录活动数据来源、因子参考资料及已知的不确定性。',
    'iso.report.title': '已编制温室气体清单报告',
    'iso.report.hint': '涵盖边界、量化方法、结果和基准年的报告。',
    'iso.verification.title': '已通过第三方核查',
    'iso.verification.hint': '独立核查机构已审查该清单。请在下方提供详细信息。',
    'iso.verification.auditor': '审计方 / 核查机构',
    'iso.verification.auditorPlaceholder': '例如：认可核查机构名称',
    'iso.verification.auditorError': '请输入审计方名称。',
    'iso.verification.date': '核查日期',
    'iso.verification.dateError': '请选择核查日期。',
    'iso.verification.hash': '核查文件哈希',
    'iso.verification.hashError':
      '请使用以 0x 开头的 64 位十六进制哈希或 IPFS CID（Qm… / bafy…）。',

    'registry.title': '按注册机构标准划分的碳信用',
    'registry.description':
      '按方法学分组的 NFT 碳信用，分为合格吨数和已注销吨数。',
    'registry.notConfigured': '尚未配置碳信用 NFT 合约，因此无法读取碳信用。',
    'registry.empty':
      '此钱包中暂无 NFT 碳信用。请先在您的公司页面领取演示碳信用，或先将碳信用代币化。',
    'registry.credits': '{count} 个碳信用',
    'registry.eligible': '合格',
    'registry.retired': '已注销',
    'registry.total': '总计',
    'registry.eligibleShort': '合格',
    'registry.retiredShort': '已注销',

    'calc.title': '盈余分配计算器',
    'calc.description':
      '将合格碳信用与您 {year} 年的排放量比较，规划注销、保留和出售的吨数。',
    'calc.offset': '注销以抵消',
    'calc.offsetHint': '所需内部抵消量：{need} tCO₂e',
    'calc.reserve': '保留',
    'calc.reserveHint': '保留 {pct}% 的盈余',
    'calc.sellable': '可售盈余',
    'calc.sellableHint': '可封装并在市场上挂牌',
    'calc.shortfall': '缺口',
    'calc.shortfallHint': '排放量未被覆盖；请购买更多碳信用',
    'calc.sliderLabel': '额外保留盈余',
    'calc.sliderValue': '盈余的 {pct}%，{tonnes}',
    'calc.sliderHelp': '将部分盈余留作未来年度使用或作为安全缓冲。',
    'calc.noSurplus': '没有可用盈余：合格碳信用未超过您的排放量。',
    'calc.ctaRetire': '注销碳信用',
    'calc.ctaWrap': '代币化 / 封装',
    'calc.ctaSell': '出售盈余',
    'calc.ctaHint':
      '在您的碳钱包中注销碳信用，将可售吨数封装为合并代币，然后挂牌出售。',

    'chart.emissions': '排放量',
    'chart.credits': '碳信用',
    'chart.offset': '抵消',
    'chart.reserve': '保留',
    'chart.sellable': '可出售',
    'chart.shortfall': '缺口',
    'chart.coverage': '抵消覆盖率',
    'chart.donutAria': '碳信用分配环形图。抵消覆盖率 {pct}。',
    'chart.barAria': '比较排放量与碳信用分配的堆叠条形图。',

    'toast.storageFailed': '无法保存到浏览器存储。刷新后您的更改可能会丢失。',
  },
};
