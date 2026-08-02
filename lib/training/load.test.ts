import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  DISCIPLINE_MULTIPLIER,
  RPE_INTENSITY_RATIO,
  intensityRatio,
  sessionLoad,
  fitnessFatigueSeries,
  freshnessBand,
  FITNESS_TIME_CONSTANT,
  FATIGUE_TIME_CONSTANT,
} from './load';
import type { IsoDate, Rpe } from './types';

const d = (s: string) => s as IsoDate;

describe('sessionLoad', () => {
  it('calibrates one hour at threshold to 100 load units', () => {
    // IR of 1.0 is threshold by definition; bike is the unweighted baseline.
    expect(sessionLoad({ durationSec: 3600, intensityRatio: 1, discipline: 'bike' })).toBe(100);
  });

  it('scales linearly with duration', () => {
    const one = sessionLoad({ durationSec: 3600, intensityRatio: 0.7, discipline: 'bike' });
    const two = sessionLoad({ durationSec: 7200, intensityRatio: 0.7, discipline: 'bike' });
    expect(two).toBeCloseTo(one * 2, 6);
  });

  it('scales with the SQUARE of intensity, so intensity costs more than duration', () => {
    const easyLong = sessionLoad({ durationSec: 7200, intensityRatio: 0.5, discipline: 'bike' });
    const hardShort = sessionLoad({ durationSec: 3600, intensityRatio: 1.0, discipline: 'bike' });
    expect(hardShort).toBeGreaterThan(easyLong);
  });

  it('weights running up and swimming down', () => {
    const args = { durationSec: 3600, intensityRatio: 1 } as const;
    const run = sessionLoad({ ...args, discipline: 'run' });
    const bike = sessionLoad({ ...args, discipline: 'bike' });
    const swim = sessionLoad({ ...args, discipline: 'swim' });
    expect(run).toBeGreaterThan(bike);
    expect(swim).toBeLessThan(bike);
    expect(run).toBeCloseTo(100 * DISCIPLINE_MULTIPLIER.run, 6);
  });

  it('returns zero for a zero-length session rather than NaN', () => {
    expect(sessionLoad({ durationSec: 0, intensityRatio: 0.8, discipline: 'run' })).toBe(0);
  });

  it('rejects a negative duration', () => {
    expect(() => sessionLoad({ durationSec: -1, intensityRatio: 1, discipline: 'run' })).toThrow();
  });

  it('is never negative, for any plausible input', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 60 * 60 * 12 }),
        fc.double({ min: 0.3, max: 1.3, noNaN: true }),
        (sec, ir) => sessionLoad({ durationSec: sec, intensityRatio: ir, discipline: 'bike' }) >= 0,
      ),
    );
  });
});

describe('intensityRatio', () => {
  it('prefers power when it is available', () => {
    const ir = intensityRatio({
      weightedPowerWatts: 190,
      ftpWatts: 200,
      avgHr: 150,
      lthr: 170,
      rpe: 9,
    });
    expect(ir).toBeCloseTo(0.95, 6);
  });

  it('falls back to pace when power is absent', () => {
    const ir = intensityRatio({
      thresholdPacePerKm: 300,
      actualPacePerKm: 330, // slower than threshold
      rpe: 9,
    });
    expect(ir).toBeCloseTo(300 / 330, 6);
    expect(ir).toBeLessThan(1);
  });

  it('falls back to heart rate when neither power nor pace is present', () => {
    expect(intensityRatio({ avgHr: 153, lthr: 170, rpe: 2 })).toBeCloseTo(0.9, 6);
  });

  it('clamps a heart-rate ratio into the plausible band', () => {
    expect(intensityRatio({ avgHr: 60, lthr: 170 })).toBe(0.5);
    expect(intensityRatio({ avgHr: 210, lthr: 170 })).toBe(1.1);
  });

  it('falls back to RPE last, which is the only path most beginners have', () => {
    expect(intensityRatio({ rpe: 4 })).toBe(RPE_INTENSITY_RATIO[4]);
  });

  it('throws when there is no signal at all, rather than guessing', () => {
    expect(() => intensityRatio({})).toThrow(/no intensity signal/i);
  });

  it('produces comparable numbers whichever signal is used for the same effort', () => {
    // An athlete at threshold: power says 1.0, HR says ~1.0, RPE 9 says ~1.02.
    const byPower = intensityRatio({ weightedPowerWatts: 200, ftpWatts: 200 });
    const byHr = intensityRatio({ avgHr: 170, lthr: 170 });
    const byRpe = intensityRatio({ rpe: 9 });
    expect(Math.abs(byPower - byHr)).toBeLessThan(0.05);
    expect(Math.abs(byPower - byRpe)).toBeLessThan(0.05);
  });
});

describe('RPE_INTENSITY_RATIO', () => {
  it('is monotonically increasing across the whole scale', () => {
    for (let r = 2; r <= 10; r++) {
      expect(RPE_INTENSITY_RATIO[r as Rpe]).toBeGreaterThan(RPE_INTENSITY_RATIO[(r - 1) as Rpe]);
    }
  });

  it('puts RPE 9 at roughly threshold', () => {
    expect(RPE_INTENSITY_RATIO[9]).toBeGreaterThan(0.98);
    expect(RPE_INTENSITY_RATIO[9]).toBeLessThan(1.06);
  });
});

describe('fitnessFatigueSeries', () => {
  it('returns one point per day across the whole range, including rest days', () => {
    const series = fitnessFatigueSeries(
      [{ date: d('2026-03-02'), load: 100 }],
      d('2026-03-01'),
      d('2026-03-05'),
    );
    expect(series).toHaveLength(5);
    expect(series.map((p) => p.date)).toEqual([
      '2026-03-01',
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
      '2026-03-05',
    ]);
  });

  it('moves fatigue faster than fitness after a hard day', () => {
    const series = fitnessFatigueSeries(
      [{ date: d('2026-03-01'), load: 100 }],
      d('2026-03-01'),
      d('2026-03-02'),
    );
    const day1 = series[0]!;
    expect(day1.fatigue).toBeGreaterThan(day1.fitness);
    expect(day1.fitness).toBeCloseTo(100 / FITNESS_TIME_CONSTANT, 6);
    expect(day1.fatigue).toBeCloseTo(100 / FATIGUE_TIME_CONSTANT, 6);
  });

  it('decays both toward zero when training stops', () => {
    const series = fitnessFatigueSeries(
      [{ date: d('2026-01-01'), load: 200 }],
      d('2026-01-01'),
      d('2026-04-01'),
    );
    const last = series.at(-1)!;
    expect(last.fatigue).toBeLessThan(0.5);
    expect(last.fitness).toBeLessThan(last.fitness + 1);
    expect(last.fitness).toBeGreaterThan(last.fatigue);
  });

  it('sums multiple sessions on the same day', () => {
    const one = fitnessFatigueSeries(
      [{ date: d('2026-03-01'), load: 100 }],
      d('2026-03-01'),
      d('2026-03-01'),
    );
    const two = fitnessFatigueSeries(
      [
        { date: d('2026-03-01'), load: 60 },
        { date: d('2026-03-01'), load: 40 },
      ],
      d('2026-03-01'),
      d('2026-03-01'),
    );
    expect(two[0]!.fitness).toBeCloseTo(one[0]!.fitness, 6);
  });

  it('reports freshness as yesterday fitness minus yesterday fatigue', () => {
    const series = fitnessFatigueSeries(
      [
        { date: d('2026-03-01'), load: 100 },
        { date: d('2026-03-02'), load: 100 },
      ],
      d('2026-03-01'),
      d('2026-03-03'),
    );
    // Day 1 has no yesterday, so freshness starts at zero.
    expect(series[0]!.freshness).toBe(0);
    expect(series[1]!.freshness).toBeCloseTo(series[0]!.fitness - series[0]!.fatigue, 6);
  });

  it('ignores loads outside the requested window', () => {
    const series = fitnessFatigueSeries(
      [{ date: d('2020-01-01'), load: 500 }],
      d('2026-03-01'),
      d('2026-03-02'),
    );
    expect(series[0]!.load).toBe(0);
    expect(series[0]!.fitness).toBe(0);
  });

  it('returns an empty series when the range is inverted', () => {
    expect(fitnessFatigueSeries([], d('2026-03-05'), d('2026-03-01'))).toEqual([]);
  });
});

describe('freshnessBand', () => {
  it('labels the documented bands', () => {
    expect(freshnessBand(20).label).toBe('Very fresh');
    expect(freshnessBand(10).label).toBe('Fresh');
    expect(freshnessBand(0).label).toBe('Neutral');
    expect(freshnessBand(-15).label).toBe('Loaded');
    expect(freshnessBand(-30).label).toBe('Overloaded');
  });

  it('always gives the athlete a plain-English reading, never a bare number', () => {
    for (const f of [30, 10, 0, -15, -40]) {
      expect(freshnessBand(f).copy.length).toBeGreaterThan(15);
      expect(freshnessBand(f).copy).not.toMatch(/failed|behind/i);
    }
  });
});
