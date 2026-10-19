import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StepperStep {
  key: string;
  label: string;
  description: string;
}

interface StepperProps {
  steps: StepperStep[];
  current: number;
  label: string;
}

export const Stepper = ({ steps, current, label }: StepperProps) => (
  <nav aria-label={label}>
    <ol className='grid grid-cols-2 gap-3 md:grid-cols-4'>
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li
            aria-current={active ? 'step' : undefined}
            className={cn(
              'flex items-start gap-3 border border-dashed p-3 transition-colors',
              active && 'border-primary bg-primary/5',
              done && 'bg-muted/40'
            )}
            key={step.key}
          >
            <span
              aria-hidden='true'
              className={cn(
                'flex size-7 shrink-0 items-center justify-center border font-semibold text-xs',
                active && 'border-primary bg-primary text-primary-foreground',
                done &&
                  'border-emerald-500 bg-emerald-500 text-white dark:border-emerald-400 dark:bg-emerald-500',
                !(active || done) && 'border-dashed text-muted-foreground'
              )}
            >
              {done ? <Check className='size-4' /> : index + 1}
            </span>
            <span className='min-w-0'>
              <span
                className={cn(
                  'block truncate font-medium text-sm',
                  !(active || done) && 'text-muted-foreground'
                )}
              >
                {step.label}
              </span>
              <span className='hidden text-muted-foreground text-xs md:block'>
                {step.description}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  </nav>
);
