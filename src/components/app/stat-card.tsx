import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  /** Percentage change; sign controls color and arrow. */
  change?: number;
  subtext?: string;
}

export const StatCard = ({
  label,
  value,
  icon,
  change,
  subtext,
}: StatCardProps) => (
  <Card className='rounded-none border-dashed shadow-none'>
    <CardContent className='space-y-2'>
      <div className='flex items-center justify-between'>
        <p className='font-medium text-muted-foreground text-sm'>{label}</p>
        {icon ? <div className='text-primary'>{icon}</div> : null}
      </div>
      <p className='font-bold text-2xl tracking-tight'>{value}</p>
      {subtext ? (
        <p className='text-muted-foreground text-xs'>{subtext}</p>
      ) : null}
      {change === undefined ? null : (
        <p
          className={cn(
            'font-semibold text-xs',
            change >= 0
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-destructive'
          )}
        >
          {change >= 0 ? '↑' : '↓'} {Math.abs(change).toFixed(2)}%
        </p>
      )}
    </CardContent>
  </Card>
);
