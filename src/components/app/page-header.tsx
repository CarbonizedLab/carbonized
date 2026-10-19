import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons or filters aligned to the right on wide screens. */
  actions?: ReactNode;
  className?: string;
}

export const PageHeader = ({
  title,
  description,
  actions,
  className,
}: PageHeaderProps) => (
  <header
    className={cn(
      'flex flex-col gap-4 border-b border-dashed pb-6 sm:flex-row sm:items-end sm:justify-between',
      className
    )}
  >
    <div className='min-w-0 space-y-1'>
      <h1 className='text-balance font-bold text-2xl tracking-tight sm:text-3xl'>
        {title}
      </h1>
      {description ? (
        <p className='max-w-2xl text-muted-foreground text-sm'>{description}</p>
      ) : null}
    </div>
    {actions ? (
      <div className='flex flex-wrap items-center gap-2'>{actions}</div>
    ) : null}
  </header>
);
