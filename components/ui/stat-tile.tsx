import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface StatTileProps {
  label: string;
  value: ReactNode;
  /** Small unit shown beside the value, e.g. "min". */
  unit?: string;
  sublabel?: string;
  delta?: {
    /** Signed; the sign and arrow carry the meaning, never colour alone. */
    value: number;
    /** Whether a rise is good. Training load rising is good; resting HR is not. */
    riseIsGood?: boolean;
    format?: (value: number) => string;
  };
  className?: string;
}

const defaultFormat = (value: number) => `${Math.abs(value).toFixed(1)}%`;

export function StatTile({ label, value, unit, sublabel, delta, className }: StatTileProps) {
  const rising = delta ? delta.value > 0 : false;
  const good = delta ? (delta.riseIsGood ?? true) === rising : false;
  const arrow = rising ? '↑' : '↓';
  const sign = rising ? '+' : '−';
  const format = delta?.format ?? defaultFormat;

  return (
    <div
      className={cn('rounded-md border border-hairline bg-surface p-3', className)}
      data-testid="stat-tile"
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
        {label}
      </div>
      <div className="mt-0.5 text-[26px] font-bold leading-tight tracking-[-0.02em]">
        <span className="tnum">{value}</span>
        {unit && <span className="ml-1 text-label font-medium text-ink-2">{unit}</span>}
      </div>
      {delta && delta.value !== 0 && (
        <div
          className={cn('mt-0.5 text-caption font-semibold', good ? 'text-good' : 'text-critical')}
        >
          {/* Arrow and sign are redundant on purpose: colour is never the only cue. */}
          <span aria-hidden="true">{arrow} </span>
          {sign}
          {format(delta.value)}
        </div>
      )}
      {sublabel && <div className="text-caption text-ink-2">{sublabel}</div>}
    </div>
  );
}
