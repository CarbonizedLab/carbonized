import type { Messages } from '@/lib/i18n';

export const messages: Messages = {
  en: {
    'page.title': 'Your Portfolio',
    'page.description':
      'Your carbon credit holdings and onchain activity, read directly from the chain',
    'page.connectHint':
      'Connect your wallet to view your carbon credit holdings and onchain activity.',
    'page.valueDisclaimer':
      'Values are indicative: tonnes held multiplied by the oracle price. They are not a market valuation or a cost basis.',

    'stat.value': 'Indicative Value',
    'stat.valueSub': 'Held tonnes × oracle price',
    'stat.holdings': 'Credits Held',
    'stat.holdingsSub': 'Active tonnes in your wallet',
    'stat.retired': 'Credits Retired',
    'stat.retiredSub': 'Permanently retired by this wallet',

    'toggle.hide': 'Hide Values',
    'toggle.show': 'Show Values',

    'tab.overview': 'Overview',
    'tab.assets': 'Assets',
    'tab.transactions': 'Transactions',

    'chart.allocation': 'Allocation by tonnes',

    'asset.defaultName': 'Carbon Project',
    'asset.indicativeValue': 'Indicative Value',
    'asset.quantity': 'Quantity',
    'asset.oraclePrice': 'Oracle Price',
    'asset.sell': 'Sell',
    'asset.retire': 'Retire',
    'asset.emptyConnected': 'No carbon credits in your wallet yet.',
    'asset.emptyDisconnected':
      'Connect your wallet to view your carbon credits.',

    'tx.mint': 'Mint',
    'tx.retire': 'Retire',
    'tx.wrap': 'Wrap',
    'tx.unwrap': 'Unwrap',
    'tx.order_created': 'Order created',
    'tx.order_filled': 'Order filled',
    'tx.order_cancelled': 'Order cancelled',
    'tx.auction_created': 'Auction created',
    'tx.bid': 'Bid',
    'tx.auction_finalized': 'Auction finalized',
    'tx.auction_cancelled': 'Auction cancelled',
    'tx.empty': 'No onchain activity found for this wallet.',
    'tx.loadFailed':
      'Some onchain history could not be loaded. The list below may be incomplete.',
    'tx.viewOnExplorer': 'View on explorer',
  },
  zh: {
    'page.title': '我的投资组合',
    'page.description': '直接从链上读取您的碳信用持仓与链上活动',
    'page.connectHint': '连接钱包以查看您的碳信用持仓和链上活动。',
    'page.valueDisclaimer':
      '数值仅供参考:持有吨数乘以预言机价格,并非市场估值或成本价。',

    'stat.value': '参考价值',
    'stat.valueSub': '持有吨数 × 预言机价格',
    'stat.holdings': '持有碳信用',
    'stat.holdingsSub': '钱包中的有效吨数',
    'stat.retired': '已注销碳信用',
    'stat.retiredSub': '该钱包永久注销的数量',

    'toggle.hide': '隐藏数值',
    'toggle.show': '显示数值',

    'tab.overview': '概览',
    'tab.assets': '资产',
    'tab.transactions': '交易',

    'chart.allocation': '按吨数配置',

    'asset.defaultName': '碳项目',
    'asset.indicativeValue': '参考价值',
    'asset.quantity': '数量',
    'asset.oraclePrice': '预言机价格',
    'asset.sell': '出售',
    'asset.retire': '注销',
    'asset.emptyConnected': '您的钱包中暂无碳信用。',
    'asset.emptyDisconnected': '连接钱包以查看您的碳信用。',

    'tx.mint': '铸造',
    'tx.retire': '注销',
    'tx.wrap': '封装',
    'tx.unwrap': '解封',
    'tx.order_created': '创建订单',
    'tx.order_filled': '订单成交',
    'tx.order_cancelled': '取消订单',
    'tx.auction_created': '创建拍卖',
    'tx.bid': '出价',
    'tx.auction_finalized': '拍卖结算',
    'tx.auction_cancelled': '取消拍卖',
    'tx.empty': '未找到该钱包的链上活动。',
    'tx.loadFailed': '部分链上历史记录未能加载,下方列表可能不完整。',
    'tx.viewOnExplorer': '在浏览器中查看',
  },
};
