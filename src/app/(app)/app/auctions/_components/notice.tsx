import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type NoticeTone = 'success' | 'warning' | 'muted';

const TONE_CLASSES: Record<NoticeTone, string> = {
  success:
    'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  warning:
    'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  muted: 'border-border bg-muted/40 text-muted-foreground',
};

interface NoticeProps {
  tone: NoticeTone;
  icon: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}

export const Notice = ({ tone, icon, children, action }: NoticeProps) => (
  <div
    className={cn(
      'flex items-center gap-2 border border-dashed p-3 text-sm',
      TONE_CLASSES[tone]
    )}
  >
    <span className='shrink-0 [&>svg]:size-4'>{icon}</span>
    <div className='flex-1'>{children}</div>
    {action}
  </div>
);

const BOLD_PATTERN = /<b>(.*?)<\/b>/g;

/** Renders a translated string, turning `<b>…</b>` into `<strong>`. */
export const Rich = ({ text }: { text: string }) => {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(BOLD_PATTERN)) {
    const start = match.index ?? 0;
    if (start > cursor) {
      nodes.push(text.slice(cursor, start));
    }
    nodes.push(<strong key={start}>{match[1]}</strong>);
    cursor = start + match[0].length;
  }
  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }
  return <>{nodes}</>;
};
