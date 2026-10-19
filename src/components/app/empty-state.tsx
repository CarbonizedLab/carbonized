import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export const EmptyState = ({
  title,
  description,
  icon,
  action,
}: EmptyStateProps) => (
  <div className='flex flex-col items-center justify-center py-12 text-center'>
    {icon ? <div className='mb-4 text-muted-foreground'>{icon}</div> : null}
    <h3 className='mb-2 font-semibold text-lg'>{title}</h3>
    <p className='mb-6 max-w-sm text-muted-foreground text-sm'>{description}</p>
    {action}
  </div>
);
