import { cva } from 'class-variance-authority';
import { Check, Clock, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type TimelineStatus =
  | 'completed'
  | 'active'
  | 'next'
  | 'pending'
  | 'error';

export interface TimelineItem {
  /** Optional rich content rendered inside the item card. */
  content?: ReactNode;
  description?: string;
  /** Custom icon. Falls back to a status icon. */
  icon?: ReactNode;
  id: string;
  /** Short status text shown as a pill, e.g. "Live · Beta". */
  label?: string;
  /** Small eyebrow above the title, e.g. a step number or a date. */
  eyebrow?: string;
  status?: TimelineStatus;
  title: string;
}

export interface TimelineProps {
  className?: string;
  items: readonly TimelineItem[];
}

const nodeVariants = cva(
  'relative z-10 flex size-10 shrink-0 items-center justify-center rounded-full border-2 bg-background transition-colors',
  {
    variants: {
      status: {
        completed:
          'border-emerald-500 bg-emerald-500 text-white shadow-[0_0_0_4px] shadow-emerald-500/15',
        active:
          'border-primary text-primary shadow-[0_0_0_4px] shadow-primary/15',
        next: 'border-foreground/60 text-foreground',
        pending: 'border-dashed border-border text-muted-foreground',
        error: 'border-destructive bg-destructive text-white',
      },
    },
    defaultVariants: { status: 'pending' },
  }
);

const cardVariants = cva(
  'flex min-w-0 flex-1 flex-col gap-4 rounded-2xl border bg-card/60 p-5 backdrop-blur-sm sm:p-6',
  {
    variants: {
      status: {
        completed: 'border-emerald-500/40',
        active: 'border-primary/40',
        next: 'border-border',
        pending: 'border-border/70',
        error: 'border-destructive/50',
      },
    },
    defaultVariants: { status: 'pending' },
  }
);

const pillVariants = cva(
  'inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 font-medium text-xs',
  {
    variants: {
      status: {
        completed:
          'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        active: 'border-primary/40 bg-primary/10 text-foreground',
        next: 'border-border bg-muted text-foreground',
        pending: 'border-dashed border-border text-muted-foreground',
        error: 'border-destructive/40 bg-destructive/10 text-destructive',
      },
    },
    defaultVariants: { status: 'pending' },
  }
);

const StatusIcon = ({ status }: { status: TimelineStatus }) => {
  if (status === 'completed') {
    return <Check aria-hidden='true' className='size-4' />;
  }
  if (status === 'error') {
    return <X aria-hidden='true' className='size-4' />;
  }
  if (status === 'active') {
    return <Clock aria-hidden='true' className='size-4' />;
  }
  return <span aria-hidden='true' className='size-2 rounded-full bg-current' />;
};

export function Timeline({ items, className }: TimelineProps) {
  return (
    <ol className={cn('flex flex-col', className)}>
      {items.map((item, index) => {
        const status = item.status ?? 'pending';
        const isLast = index === items.length - 1;
        return (
          <li
            className={cn('relative flex gap-4 sm:gap-5', !isLast && 'pb-6')}
            key={item.id}
          >
            {isLast ? null : (
              <span
                aria-hidden='true'
                className={cn(
                  'absolute top-11 bottom-1 left-5 w-px -translate-x-1/2',
                  status === 'completed'
                    ? 'bg-gradient-to-b from-emerald-500 to-border'
                    : 'bg-border'
                )}
              />
            )}
            <span className={nodeVariants({ status })}>
              {item.icon ?? <StatusIcon status={status} />}
            </span>
            <article className={cardVariants({ status })}>
              <header className='flex flex-wrap items-center justify-between gap-2'>
                <div className='flex min-w-0 items-center gap-3'>
                  {item.eyebrow ? (
                    <span className='font-mono text-muted-foreground text-xs'>
                      {item.eyebrow}
                    </span>
                  ) : null}
                  <h2 className='font-semibold text-lg tracking-tight'>
                    {item.title}
                  </h2>
                </div>
                {item.label ? (
                  <span className={pillVariants({ status })}>{item.label}</span>
                ) : null}
              </header>
              {item.description ? (
                <p className='text-muted-foreground text-sm leading-relaxed'>
                  {item.description}
                </p>
              ) : null}
              {item.content}
            </article>
          </li>
        );
      })}
    </ol>
  );
}
