'use client';

import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-on',
  secondary: 'bg-surface text-ink border border-hairline',
  ghost: 'text-primary',
  destructive: 'bg-critical text-white',
};

/**
 * Sizes come from docs/06 § Touch targets. `xl` is the live-workout size:
 * hittable while moving, wet, or wearing gloves.
 */
const SIZE: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-label',
  md: 'h-touch px-4 text-body',
  lg: 'h-touch-primary w-full px-4 text-body-lg',
  xl: 'h-touch-live w-full px-4 text-body-lg',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks interaction without changing the button width. */
  loading?: boolean;
  /**
   * Why the button is disabled. Surfaced to assistive tech and on long-press,
   * so a disabled control is never a dead end (docs/01 § Cross-cutting).
   */
  disabledReason?: string;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled,
    disabledReason,
    className,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isDisabled = disabled === true || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-disabled={isDisabled || undefined}
      title={isDisabled ? disabledReason : undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-semibold',
        'transition-transform duration-100 active:scale-[0.985]',
        'disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {/* Keeps the label in place so the button never changes width mid-action. */}
      {loading && (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
      {isDisabled && disabledReason && <span className="sr-only">{disabledReason}</span>}
    </button>
  );
});
