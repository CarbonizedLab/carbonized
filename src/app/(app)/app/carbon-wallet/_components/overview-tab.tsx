import { ArrowDownRight, ArrowUpRight, DollarSign, Leaf } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCarbonTonnes, formatCurrency } from '@/lib/carb-format';
import { useT } from '@/lib/i18n';
import type { Order } from '@/types/carb';
import { messages } from '../_messages';
import { SELL_TEXT, SUCCESS_TEXT } from './wallet-styles';

const MAX_OVERVIEW_ORDERS = 4;

interface OverviewTabProps {
  usdcBalance: number | null;
  cctBalance: number | null;
  nftCount: number;
  nftActiveTonnes: number;
  activeDepCount: number;
  totalDepActive: number;
  retiredDepCount: number;
  totalDepRetired: number;
  orders: Order[];
}

const TokenHoldingsCard = ({
  usdcBalance,
  cctBalance,
}: Pick<OverviewTabProps, 'usdcBalance' | 'cctBalance'>) => {
  const t = useT(messages);
  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle className='flex items-center justify-between text-base'>
          {t('overview.tokenHoldings')}
          <DollarSign className='size-4 text-primary' />
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='flex items-center justify-between'>
          <div>
            <p className='font-medium text-sm'>{t('overview.usdc')}</p>
            <p className='text-muted-foreground text-xs'>
              {t('overview.paymentToken')}
            </p>
          </div>
          <span className='font-bold text-lg'>
            {usdcBalance === null ? '—' : formatCurrency(usdcBalance)}
          </span>
        </div>
        <div className='flex items-center justify-between'>
          <div>
            <p className='font-medium text-sm'>{t('overview.cctWrapped')}</p>
            <p className='text-muted-foreground text-xs'>
              {t('overview.carbonCreditTokens')}
            </p>
          </div>
          <span className='font-bold text-lg'>
            {cctBalance === null ? '—' : formatCarbonTonnes(cctBalance)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

const CreditsSummaryCard = ({
  nftCount,
  nftActiveTonnes,
  activeDepCount,
  totalDepActive,
  retiredDepCount,
  totalDepRetired,
}: Omit<OverviewTabProps, 'usdcBalance' | 'cctBalance' | 'orders'>) => {
  const t = useT(messages);
  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardHeader>
        <CardTitle className='flex items-center justify-between text-base'>
          {t('overview.creditsSummary')}
          <Leaf className='size-4 text-primary' />
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-4 text-sm'>
        <div className='flex items-center justify-between'>
          <span>{t('overview.nftOnChain')}</span>
          <span className='font-bold'>
            {nftCount} ({formatCarbonTonnes(nftActiveTonnes)})
          </span>
        </div>
        <div className='flex items-center justify-between'>
          <span>{t('overview.depositoryActive')}</span>
          <span className='font-bold'>
            {activeDepCount} ({formatCarbonTonnes(totalDepActive)})
          </span>
        </div>
        <div className='flex items-center justify-between'>
          <span>{t('overview.depositoryRetired')}</span>
          <span className='font-bold text-muted-foreground'>
            {retiredDepCount} ({formatCarbonTonnes(totalDepRetired)})
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

const ActiveOrderRow = ({ order: o }: { order: Order }) => {
  const t = useT(messages);
  return (
    <div className='flex items-center justify-between py-2.5 text-sm'>
      <div className='flex items-center gap-2'>
        {o.isBuyOrder ? (
          <ArrowDownRight className={`size-4 ${SUCCESS_TEXT}`} />
        ) : (
          <ArrowUpRight className={`size-4 ${SELL_TEXT}`} />
        )}
        <span>
          {t('orders.orderTitle', {
            side: o.isBuyOrder ? t('orders.buy') : t('orders.sell'),
            id: o.orderId,
          })}
        </span>
      </div>
      <div className='text-right'>
        <span className='font-medium'>
          {t('overview.remaining', {
            amount: formatCarbonTonnes(o.amount - o.filled),
          })}
        </span>
        <span className='ml-2 text-muted-foreground'>
          @ {formatCurrency(o.pricePerTonne)}/t
        </span>
      </div>
    </div>
  );
};

export const OverviewTab = ({ orders, ...summary }: OverviewTabProps) => {
  const t = useT(messages);
  return (
    <div className='grid gap-4 lg:grid-cols-2'>
      <TokenHoldingsCard
        cctBalance={summary.cctBalance}
        usdcBalance={summary.usdcBalance}
      />
      <CreditsSummaryCard
        activeDepCount={summary.activeDepCount}
        nftActiveTonnes={summary.nftActiveTonnes}
        nftCount={summary.nftCount}
        retiredDepCount={summary.retiredDepCount}
        totalDepActive={summary.totalDepActive}
        totalDepRetired={summary.totalDepRetired}
      />

      {orders.length > 0 && (
        <Card className='rounded-none border-dashed shadow-none lg:col-span-2'>
          <CardHeader>
            <CardTitle className='text-base'>
              {t('overview.activeOrders')}
            </CardTitle>
          </CardHeader>
          <CardContent className='divide-y divide-dashed'>
            {orders.slice(0, MAX_OVERVIEW_ORDERS).map((o) => (
              <ActiveOrderRow key={o.orderId} order={o} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
