import { RefreshCw, Wallet, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { formatCarbonTonnes, formatCurrency } from '@/lib/carb-format';
import type { TranslateFn } from '@/lib/i18n';
import { cn } from '@/lib/utils';

const BalanceChip = ({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) => (
  <div className='flex items-center gap-2 border border-dashed px-4 py-2.5'>
    {icon}
    <span className='text-muted-foreground text-sm'>{label}</span>
    <span className='font-semibold text-lg'>{value}</span>
  </div>
);

interface BalanceBarProps {
  usdcBalance: number | null;
  cctBalance: number | null;
  refreshing: boolean;
  onRefresh: () => void;
  t: TranslateFn;
}

export const BalanceBar = ({
  usdcBalance,
  cctBalance,
  refreshing,
  onRefresh,
  t,
}: BalanceBarProps) => (
  <div className='flex flex-wrap items-center gap-3'>
    <BalanceChip
      icon={<Wallet className='size-4 text-primary' />}
      label='USDG'
      value={usdcBalance === null ? '—' : formatCurrency(usdcBalance)}
    />
    <BalanceChip
      icon={<Zap className='size-4 text-primary' />}
      label='CCT-VCS'
      value={cctBalance === null ? '—' : formatCarbonTonnes(cctBalance)}
    />
    <Button
      aria-label={t('balance.refresh')}
      disabled={refreshing}
      onClick={onRefresh}
      size='icon'
      title={t('balance.refresh')}
      type='button'
      variant='outline'
    >
      <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
    </Button>
  </div>
);
