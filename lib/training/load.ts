import { addDays, daysBetween, eachDay } from './calendar';
import type { DailyMetric, Discipline, IsoDate, Rpe, Step, Zone } from './types';

/**
 * The load model.
 *
 * Generic names throughout — Load, Intensity Ratio, Fitness, Fatigue,
 * Freshness — because the industry-standard names are trademarked. The maths is
 * the same publicly-documented science. See docs/adr/0003-generic-load-metric.md.
 */

/** One hour at threshold = 100 Load Units. */
const LOAD_CALIBRATION = 100;

/**
 * Raw load under-counts running's mechanical cost and over-counts swimming's
 * systemic cost. Applied when aggregating across disciplines.
 */
export const DISCIPLINE_MULTIPLIER: Readonly<Record<Discipline, number>> = {
  run: 1.15,
  brick: 1.05,
  bike: 1.0,
  swim: 0.85,
  strength: 0.7,
  mobility: 0.3,
} as const;

/**
 * Foster's session-RPE mapped onto the same quadratic scale as the measured
 * paths, so a beginner logging by feel and an athlete with a power meter
 * produce comparable numbers.
 */
export const RPE_INTENSITY_RATIO: Readonly<Record<Rpe, number>> = {
  1: 0.45,
  2: 0.55,
  3: 0.63,
  4: 0.7,
  5: 0.77,
  6: 0.84,
  7: 0.9,
  8: 0.96,
  9: 1.02,
  10: 1.08,
} as const;

/**
 * The intensity a *planned* session is expected to be ridden at, per zone.
 * Used to cost a plan before any of it has been done.
 */
export const ZONE_INTENSITY_RATIO: Readonly<Record<Zone, number>> = {
  1: 0.55,
  2: 0.68,
  3: 0.84,
  4: 0.95,
  5: 1.05,
} as const;

const HR_RATIO_MIN = 0.5;
const HR_RATIO_MAX = 1.1;

export interface IntensitySignals {
  readonly weightedPowerWatts?: number;
  readonly ftpWatts?: number;
  readonly thresholdPacePerKm?: number;
  readonly actualPacePerKm?: number;
  readonly cssPacePer100m?: number;
  readonly actualPacePer100m?: number;
  readonly avgHr?: number;
  readonly lthr?: number;
  readonly rpe?: Rpe;
}

/**
 * Effort relative to threshold, taken from the most direct signal available.
 *
 * Priority: power → run pace → swim pace → heart rate → RPE. RPE is the only
 * path most first-timers have, and it is a valid one (ADR-0005).
 */
export function intensityRatio(signals: IntensitySignals): number {
  const { weightedPowerWatts, ftpWatts } = signals;
  if (weightedPowerWatts != null && ftpWatts != null && ftpWatts > 0) {
    return weightedPowerWatts / ftpWatts;
  }

  const { thresholdPacePerKm, actualPacePerKm } = signals;
  if (thresholdPacePerKm != null && actualPacePerKm != null && actualPacePerKm > 0) {
    // Pace is inverted: faster (smaller) pace means higher intensity.
    return thresholdPacePerKm / actualPacePerKm;
  }

  const { cssPacePer100m, actualPacePer100m } = signals;
  if (cssPacePer100m != null && actualPacePer100m != null && actualPacePer100m > 0) {
    return cssPacePer100m / actualPacePer100m;
  }

  const { avgHr, lthr } = signals;
  if (avgHr != null && lthr != null && lthr > 0) {
    return Math.min(HR_RATIO_MAX, Math.max(HR_RATIO_MIN, avgHr / lthr));
  }

  const { rpe } = signals;
  if (rpe != null) return RPE_INTENSITY_RATIO[rpe];

  throw new TypeError(
    'No intensity signal available: need power, pace, heart rate, or an RPE rating.',
  );
}

export interface SessionLoadInput {
  readonly durationSec: number;
  readonly intensityRatio: number;
  readonly discipline: Discipline;
}

/**
 * `Load = hours × IR² × 100 × disciplineWeight`
 *
 * Squaring intensity is the whole point of the metric: it makes hard work cost
 * disproportionately more than long easy work.
 */
export function sessionLoad(input: SessionLoadInput): number {
  const { durationSec, intensityRatio: ir, discipline } = input;
  if (!Number.isFinite(durationSec) || durationSec < 0) {
    throw new RangeError(
      `Duration must be a non-negative number of seconds, got ${String(durationSec)}.`,
    );
  }
  if (!Number.isFinite(ir) || ir < 0) {
    throw new RangeError(`Intensity ratio must be a non-negative number, got ${String(ir)}.`);
  }
  const hours = durationSec / 3600;
  return hours * ir * ir * LOAD_CALIBRATION * DISCIPLINE_MULTIPLIER[discipline];
}

/** What a planned session is expected to cost, summed over its steps. */
export function plannedLoad(steps: readonly Step[], discipline: Discipline): number {
  return steps.reduce((total, step) => {
    const repeats = step.repeats ?? 1;
    const work = sessionLoad({
      durationSec: step.durationSec * repeats,
      intensityRatio: ZONE_INTENSITY_RATIO[step.zone],
      discipline,
    });
    const recovery = step.recovery
      ? sessionLoad({
          durationSec: step.recovery.durationSec * Math.max(0, repeats - 1),
          intensityRatio: ZONE_INTENSITY_RATIO[step.recovery.zone],
          discipline,
        })
      : 0;
    return total + work + recovery;
  }, 0);
}

/* ------------------------------------------------------ fitness and fatigue */

/** Days. Fitness is the slow-moving average of daily load. */
export const FITNESS_TIME_CONSTANT = 42;
/** Days. Fatigue is the fast-moving one. */
export const FATIGUE_TIME_CONSTANT = 7;

export interface DailyLoad {
  readonly date: IsoDate;
  readonly load: number;
}

/**
 * Exponentially-weighted moving averages of daily load (Banister's
 * impulse–response model), evaluated for every day in the range — rest days
 * included, since decay is the point.
 *
 * Freshness is yesterday's fitness minus yesterday's fatigue, by convention.
 */
export function fitnessFatigueSeries(
  loads: readonly DailyLoad[],
  from: IsoDate,
  to: IsoDate,
): DailyMetric[] {
  if (daysBetween(from, to) < 0) return [];

  const byDate = new Map<string, number>();
  for (const { date, load } of loads) {
    byDate.set(date, (byDate.get(date) ?? 0) + load);
  }

  let fitness = 0;
  let fatigue = 0;
  return eachDay(from, to).map((date) => {
    const freshness = fitness - fatigue; // yesterday's values
    const load = byDate.get(date) ?? 0;
    fitness += (load - fitness) / FITNESS_TIME_CONSTANT;
    fatigue += (load - fatigue) / FATIGUE_TIME_CONSTANT;
    return { date, load, fitness, fatigue, freshness };
  });
}

export type FreshnessLabel = 'Very fresh' | 'Fresh' | 'Neutral' | 'Loaded' | 'Overloaded';

export interface FreshnessReading {
  readonly label: FreshnessLabel;
  /** Always shown instead of, or alongside, the raw number. */
  readonly copy: string;
}

/** Turns a freshness number into something an athlete can act on. */
export function freshnessBand(freshness: number): FreshnessReading {
  if (freshness > 15) {
    return {
      label: 'Very fresh',
      copy: 'Well rested. Great before a race — but if it lasts, fitness starts slipping.',
    };
  }
  if (freshness > 5) {
    return {
      label: 'Fresh',
      copy: 'Fresh and ready. This is where you want to be on race morning.',
    };
  }
  if (freshness > -10) {
    return {
      label: 'Neutral',
      copy: 'Normal training balance. Fitness and fatigue are roughly in step.',
    };
  }
  if (freshness > -25) {
    return {
      label: 'Loaded',
      copy: 'Building hard and carrying fatigue. That is exactly what mid-build should look like.',
    };
  }
  return {
    label: 'Overloaded',
    copy: 'Deep in it. Watch your sleep and appetite — if either goes, take the easy week early.',
  };
}

/** Convenience: the last day of a series, or a zeroed reading if it is empty. */
export function latestMetric(series: readonly DailyMetric[], fallbackDate: IsoDate): DailyMetric {
  return (
    series.at(-1) ?? {
      date: addDays(fallbackDate, 0),
      load: 0,
      fitness: 0,
      fatigue: 0,
      freshness: 0,
    }
  );
}
