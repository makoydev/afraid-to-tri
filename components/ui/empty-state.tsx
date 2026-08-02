import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface EmptyStateProps {
  title: string;
  /**
   * What will appear here, and — where relevant — what unlocks it.
   * Never a bare "No data" (docs/02 § Empty & error states).
   */
  description: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 rounded-md border border-hairline',
        'bg-surface px-4 py-8 text-center',
        className,
      )}
    >
      {icon && (
        <span aria-hidden="true" className="text-ink-muted">
          {icon}
        </span>
      )}
      <h3 className="text-title">{title}</h3>
      <p className="max-w-[46ch] text-body text-ink-2">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
