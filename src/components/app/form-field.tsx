import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';

interface FormFieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

/** Label + control + hint/error line. The control must use `id` and set `aria-describedby` to `${id}-note`. */
export const FormField = ({
  id,
  label,
  hint,
  error,
  children,
}: FormFieldProps) => (
  <div className='space-y-1.5'>
    <Label htmlFor={id}>{label}</Label>
    {children}
    {error ? (
      <p className='text-destructive text-xs' id={`${id}-note`} role='alert'>
        {error}
      </p>
    ) : null}
    {!error && hint ? (
      <p className='text-muted-foreground text-xs' id={`${id}-note`}>
        {hint}
      </p>
    ) : null}
  </div>
);
