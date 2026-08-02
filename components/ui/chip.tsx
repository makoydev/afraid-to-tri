import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { Zone } from '@/lib/training/types';

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  children?: ReactNode;
}

export function Chip({ className, children, ...rest }: ChipProps) {
  return (
    <span
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full border border-hairline',
        'bg-plane px-2.5 text-caption text-ink-2',
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

const ZONE_BG: Record<Zone, string> = {
  1: 'bg-zone-1',
  2: 'bg-zone-2',
  3: 'bg-zone-3',
  4: 'bg-zone-4',
  5: 'bg-zone-5',
};

export interface ZoneChipProps extends Omit<ChipProps, 'children'> {
  zone: Zone;
  /** The band's word — shown alongside the number, never colour alone. */
  label: string;
}

/**
 * Zones are an ordinal ramp of one hue, so the number and word always
 * accompany the colour (docs/06 § Intensity zones).
 */
export function ZoneChip({ zone, label, className, ...rest }: ZoneChipProps) {
  return (
    <Chip className={cn('border-transparent text-zone-ink', ZONE_BG[zone], className)} {...rest}>
      Zone {zone} · {label}
    </Chip>
  );
}
