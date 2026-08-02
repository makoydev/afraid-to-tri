import type { Rpe, Zone } from './types';

/**
 * Intensity zones.
 *
 * Beginners train by feel; numeric zones unlock once a test exists (ADR-0005).
 * Both altitudes describe the same five bands, so nothing has to be re-learned
 * when an athlete graduates from one to the other.
 *
 * Percentages are Friel's, documented in docs/03 § Numeric zone derivation.
 */

export interface ZoneBand {
  readonly name: string;
  /** The default, beginner-facing description of the effort. */
  readonly cue: string;
  readonly talkTest: string;
  readonly rpe: readonly [number, number];
  readonly purpose: string;
}

export const ZONE_BANDS: Readonly<Record<Zone, ZoneBand>> = {
  1: {
    name: 'Recovery',
    cue: 'Very easy — this should feel almost too easy',
    talkTest: 'You could sing',
    rpe: [1, 2],
    purpose: 'Blood flow and active recovery',
  },
  2: {
    name: 'Easy',
    cue: 'Comfortable — you could hold a conversation',
    talkTest: 'Full sentences, comfortably',
    rpe: [3, 4],
    purpose: 'Aerobic base — the bulk of your training',
  },
  3: {
    name: 'Steady',
    cue: 'Working but controlled',
    talkTest: 'Short sentences only',
    rpe: [5, 6],
    purpose: 'Race effort for longer events',
  },
  4: {
    name: 'Hard',
    cue: 'Uncomfortable, but you could hold it for about an hour',
    talkTest: 'A few words at a time',
    rpe: [7, 8],
    purpose: 'Raises your ceiling',
  },
  5: {
    name: 'Very hard',
    cue: 'Very hard — you cannot keep this up for long',
    talkTest: 'One word, or nothing',
    rpe: [9, 10],
    purpose: 'Speed and top-end fitness',
  },
} as const;

export interface ZoneRange {
  readonly zone: Zone;
  readonly min: number;
  readonly max: number;
}

export type ZoneTable = Readonly<Record<Zone, ZoneRange>>;

const ZONE_LIST: readonly Zone[] = [1, 2, 3, 4, 5];

/**
 * Builds a contiguous table from ascending upper bounds.
 * `uppers[i]` is the inclusive top of zone i+1; the last zone is open-ended.
 */
function fromUpperBounds(uppers: readonly number[], ceiling: number): ZoneTable {
  const table = {} as Record<Zone, ZoneRange>;
  let min = 0;
  ZONE_LIST.forEach((zone, i) => {
    const max = i < uppers.length ? uppers[i]! : ceiling;
    table[zone] = { zone, min, max };
    min = max + 1;
  });
  return table;
}

/* --------------------------------------------------------------- heart rate */

const LTHR_MIN = 90;
const LTHR_MAX = 220;

/**
 * Heart-rate zones as a percentage of *discipline* LTHR. Run and bike LTHR
 * differ — typically by 5–10 bpm — and must be tested separately.
 */
export function hrZonesFromLthr(lthr: number, discipline: 'run' | 'bike'): ZoneTable {
  if (!Number.isFinite(lthr) || lthr < LTHR_MIN || lthr > LTHR_MAX) {
    throw new RangeError(
      `LTHR of ${String(lthr)} bpm is outside the plausible range ${String(LTHR_MIN)}–${String(LTHR_MAX)}.`,
    );
  }
  // Upper bound of each of zones 1–4, as a fraction of LTHR.
  const fractions = discipline === 'run' ? [0.85, 0.9, 0.95, 1.0] : [0.81, 0.9, 0.94, 1.0];
  const uppers = fractions.map((f) => Math.round(lthr * f) - 1);
  return fromUpperBounds(uppers, Math.round(lthr * 1.15));
}

/* -------------------------------------------------------------------- power */

/** Power zones as a percentage of FTP. */
export function powerZonesFromFtp(ftpWatts: number): ZoneTable {
  if (!Number.isFinite(ftpWatts) || ftpWatts <= 0) {
    throw new RangeError(`FTP must be a positive number of watts, got ${String(ftpWatts)}.`);
  }
  const uppers = [0.55, 0.75, 0.9, 1.05].map(
    (f) => Math.round(ftpWatts * f) - (f === 0.55 ? 1 : 0),
  );
  // Zone 1 is strictly below 55%; the others are inclusive of their top figure.
  return fromUpperBounds(uppers, Math.round(ftpWatts * 1.6));
}

/* --------------------------------------------------------------------- pace */

/**
 * Run pace zones, in seconds per kilometre.
 *
 * Pace is inverted relative to every other measure: a *higher* percentage of
 * threshold pace means a *slower* run. Zone 1 is therefore the largest number.
 */
export function runPaceZonesFromThreshold(thresholdSecPerKm: number): ZoneTable {
  if (!Number.isFinite(thresholdSecPerKm) || thresholdSecPerKm <= 0) {
    throw new RangeError('Threshold pace must be a positive number of seconds per km.');
  }
  const at = (pct: number) => Math.round(thresholdSecPerKm * pct);
  const table: Record<Zone, ZoneRange> = {
    1: { zone: 1, min: at(1.3), max: at(1.6) },
    2: { zone: 2, min: at(1.14), max: at(1.29) },
    3: { zone: 3, min: at(1.06), max: at(1.13) },
    4: { zone: 4, min: at(1.0), max: at(1.05) },
    5: { zone: 5, min: at(0.85), max: at(0.99) },
  };
  return table;
}

/** Swim zones, in seconds per 100 m, offset from CSS pace. */
export function swimZonesFromCss(cssSecPer100m: number): ZoneTable {
  if (!Number.isFinite(cssSecPer100m) || cssSecPer100m <= 0) {
    throw new RangeError('CSS pace must be a positive number of seconds per 100 m.');
  }
  const c = cssSecPer100m;
  return {
    1: { zone: 1, min: c + 9, max: c + 20 },
    2: { zone: 2, min: c + 6, max: c + 8 },
    3: { zone: 3, min: c + 3, max: c + 5 },
    4: { zone: 4, min: c - 2, max: c + 2 },
    5: { zone: 5, min: c - 12, max: c - 3 },
  };
}

/* ---------------------------------------------------------------- estimates */

/**
 * Estimates maximum heart rate from age (Nes et al.).
 *
 * More accurate than `220 - age`, but still roughly ±10 bpm at one standard
 * deviation. Anything derived from this must be labelled an estimate in the UI.
 */
export function estimateMaxHr(ageYears: number): number {
  if (!Number.isFinite(ageYears) || ageYears < 10 || ageYears > 100) {
    throw new RangeError(`Age of ${String(ageYears)} is outside the supported range 10–100.`);
  }
  return Math.round(211 - 0.64 * ageYears);
}

/** Maps a perceived-effort rating onto the zone band it belongs to. */
export function zoneForRpe(rpe: Rpe): Zone {
  for (const zone of ZONE_LIST) {
    const [lo, hi] = ZONE_BANDS[zone].rpe;
    if (rpe >= lo && rpe <= hi) return zone;
  }
  /* istanbul ignore next -- the RPE type makes this unreachable */
  return 5;
}
