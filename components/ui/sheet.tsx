'use client';

import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Required: a sheet with no accessible name is unusable with a screen reader. */
  title: string;
  /** Hide the title visually when the content already carries it. */
  hideTitle?: boolean;
  description?: string;
  children?: ReactNode;
  className?: string;
}

/**
 * The bottom sheet — the primary disclosure pattern on mobile (docs/06).
 *
 * Built on Radix Dialog so focus trapping, `Esc`, scroll locking and
 * `aria-modal` are handled properly rather than approximated.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  hideTitle = false,
  description,
  children,
  className,
}: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/45" />
        <Dialog.Content
          className={cn(
            'fixed inset-x-0 bottom-0 z-50 max-h-[82dvh] overflow-y-auto',
            'rounded-t-[20px] bg-raised px-4 pb-[calc(24px+env(safe-area-inset-bottom))] pt-3',
            'shadow-sheet',
            className,
          )}
        >
          <div
            aria-hidden="true"
            className="mx-auto mb-4 h-1 w-9 rounded-full bg-hairline"
            data-testid="sheet-grip"
          />
          <Dialog.Title className={hideTitle ? 'sr-only' : 'mb-2 text-title'}>{title}</Dialog.Title>
          {description ? (
            <Dialog.Description className="mb-3 text-body text-ink-2">
              {description}
            </Dialog.Description>
          ) : (
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
