import { ArrowDownRight, ArrowUpRight, ShoppingCart } from 'lucide-react';
import { EmptyState } from '@/components/app/empty-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCarbonTonnes, formatCurrency } from '@/lib/carb-format';
import { useT } from '@/lib/i18n';
import type { Order } from '@/types/carb';
import { messages } from '../_messages';
import { PERCENT, SELL_TEXT, SUCCESS_TEXT } from './wallet-styles';

const FillProgress = ({ order: o }: { order: Order }) => {
  const t = useT(messages);
  return (
    <div>
      <div className='h-2 w-full bg-muted'>
        <div
          className='h-2 bg-primary transition-all'
          style={{
            width: `${Math.min((o.filled / o.amount) * PERCENT, PERCENT)}%`,
          }}
        />
      </div>
      <p className='mt-1 text-right text-muted-foreground text-xs'>
        {t('orders.percentFilled', {
          percent: ((o.filled / o.amount) * PERCENT).toFixed(1),
        })}
      </p>
    </div>
  );
};

const OrderCard = ({ order: o }: { order: Order }) => {
  const t = useT(messages);
  return (
    <Card className='rounded-none border-dashed shadow-none'>
      <CardContent className='space-y-3'>
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-3'>
            {o.isBuyOrder ? (
              <ArrowDownRight className={`size-5 ${SUCCESS_TEXT}`} />
            ) : (
              <ArrowUpRight className={`size-5 ${SELL_TEXT}`} />
            )}
            <div>
              <p className='font-semibold'>
                {t('orders.orderTitle', {
                  side: o.isBuyOrder ? t('orders.buy') : t('orders.sell'),
                  id: o.orderId,
                })}
              </p>
              <p className='text-muted-foreground text-sm'>
                {t('orders.perTonne', {
                  price: formatCurrency(o.pricePerTonne),
                })}
              </p>
            </div>
          </div>
          <Badge
            className={o.isActive ? SUCCESS_TEXT : 'text-muted-foreground'}
            variant='outline'
          >
            {o.isActive ? t('orders.active') : t('orders.closed')}
          </Badge>
        </div>
        <div className='grid grid-cols-3 gap-4 text-sm'>
          <div>
            <p className='text-muted-foreground text-xs'>
              {t('orders.totalAmount')}
            </p>
            <p className='font-medium'>{formatCarbonTonnes(o.amount)}</p>
          </div>
          <div>
            <p className='text-muted-foreground text-xs'>
              {t('orders.filled')}
            </p>
            <p className={`font-medium ${SUCCESS_TEXT}`}>
              {formatCarbonTonnes(o.filled)}
            </p>
          </div>
          <div>
            <p className='text-muted-foreground text-xs'>
              {t('orders.remaining')}
            </p>
            <p className={`font-medium ${SELL_TEXT}`}>
              {formatCarbonTonnes(o.amount - o.filled)}
            </p>
          </div>
        </div>
        {o.filled > 0 && <FillProgress order={o} />}
      </CardContent>
    </Card>
  );
};

interface OrdersTabProps {
  loading: boolean;
  orders: Order[];
}

export const OrdersTab = ({ loading, orders }: OrdersTabProps) => {
  const t = useT(messages);
  if (loading) {
    return (
      <div className='space-y-4'>
        <Skeleton className='h-20' />
        <Skeleton className='h-20' />
        <Skeleton className='h-20' />
      </div>
    );
  }
  if (orders.length === 0) {
    return (
      <EmptyState
        description={t('orders.emptyDescription')}
        icon={<ShoppingCart className='size-12' />}
        title={t('orders.emptyTitle')}
      />
    );
  }
  return (
    <div className='space-y-4'>
      {orders.map((o) => (
        <OrderCard key={o.orderId} order={o} />
      ))}
    </div>
  );
};
