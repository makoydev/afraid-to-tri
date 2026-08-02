import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Discipline or status colour shown as a stripe down the leading edge. */
  stripeColor?: string;
  children?: ReactNode;
}

export function Card({ stripeColor, className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'flex gap-3 rounded-md border border-hairline bg-surface p-4 shadow-card',
        className,
      )}
      {...rest}
    >
      {stripeColor && (
        <span
          aria-hidden="true"
          className="w-1 shrink-0 self-stretch rounded-full"
          style={{ backgroundColor: stripeColor }}
        />
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function CardTitle({ className, children, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={cn('text-title', className)} {...rest}>
      {children}
    </h2>
  );
}

export function CardBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex flex-col gap-3', className)} {...rest}>
      {children}
    </div>
  );
}
