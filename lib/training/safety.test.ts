import { describe, it, expect } from 'vitest';
import { validatePlan, assertPlanIsSafe, SAFETY_LIMITS } from './safety';
import { makePlan, makeProfile, makeGoal, iso } from './testing/fixtures';
import type { Weekday } from './types';

const codes = (plan: Parameters<typeof validatePlan>[0], profile = makeProfile()) =>
  validatePlan(plan, profile).map((v) => v.code);

describe('validatePlan — ramp rate', () => {
  it('accepts a plan that ramps within the cap', () => {
    const plan = makePlan({
      weeks: [{ targetLoad: 200 }, { targetLoad: 210 }, { targetLoad: 220 }],
    });
    expect(codes(plan)).not.toContain('RAMP_TOO_STEEP');
  });

  it('rejects a week that jumps more than 10%', () => {
    const plan = makePlan({ weeks: [{ targetLoad: 200 }, { targetLoad: 260 }] });
    expect(codes(plan)).toContain('RAMP_TOO_STEEP');
  });

  it('allows a big jump out of a recovery week, since that is the plan working', () => {
    const plan = makePlan({
      weeks: [{ targetLoad: 300 }, { targetLoad: 180, isRecovery: true }, { targetLoad: 310 }],
    });
    expect(codes(plan)).not.toContain('RAMP_TOO_STEEP');
  });

  it('rejects more than 30% growth between consecutive four-week blocks', () => {
    // Compares block totals: weeks 4-7 against weeks 0-3.
    const plan = makePlan({
      weeks: [
        { targetLoad: 200 },
        { targetLoad: 200 },
        { targetLoad: 200 },
        { targetLoad: 200 },
        { targetLoad: 300 },
        { targetLoad: 300 },
        { targetLoad: 300 },
        { targetLoad: 300 },
      ],
    });
    expect(codes(plan)).toContain('RAMP_TOO_STEEP_ROLLING');
  });

  it('accepts a 20% block-over-block increase', () => {
    const plan = makePlan({
      weeks: [
        { targetLoad: 200 },
        { targetLoad: 200 },
        { targetLoad: 200 },
        { targetLoad: 200 },
        { targetLoad: 240 },
        { targetLoad: 240 },
        { targetLoad: 240 },
        { targetLoad: 240 },
      ],
    });
    expect(codes(plan)).not.toContain('RAMP_TOO_STEEP_ROLLING');
  });

  it('does not read a recovery week as a spike in the following block', () => {
    const plan = makePlan({
      weeks: [
        { targetLoad: 200 },
        { targetLoad: 210 },
        { targetLoad: 220 },
        { targetLoad: 130, isRecovery: true },
        { targetLoad: 230 },
        { targetLoad: 240 },
        { targetLoad: 250 },
        { targetLoad: 150, isRecovery: true },
      ],
    });
    expect(codes(plan)).not.toContain('RAMP_TOO_STEEP_ROLLING');
  });
});

describe('validatePlan — recovery weeks', () => {
  it('requires a recovery week to be at least 30% lighter', () => {
    const plan = makePlan({
      weeks: [{ targetLoad: 300 }, { targetLoad: 250, isRecovery: true }],
    });
    expect(codes(plan)).toContain('RECOVERY_NOT_LIGHT_ENOUGH');
  });

  it('accepts a properly light recovery week', () => {
    const plan = makePlan({
      weeks: [{ targetLoad: 300 }, { targetLoad: 190, isRecovery: true }],
    });
    expect(codes(plan)).not.toContain('RECOVERY_NOT_LIGHT_ENOUGH');
  });
});

describe('validatePlan — hard sessions', () => {
  const hard = (date: string, id: string) => ({ id, date: iso(date), zone: 4 as const });

  it('caps a first-timer at two hard sessions a week', () => {
    const plan = makePlan({
      sessions: [hard('2026-08-03', 'a'), hard('2026-08-05', 'b'), hard('2026-08-07', 'c')],
    });
    expect(codes(plan, makeProfile({ tier: 'first_timer' }))).toContain('TOO_MANY_HARD_SESSIONS');
  });

  it('allows an experienced athlete more', () => {
    const plan = makePlan({
      sessions: [hard('2026-08-03', 'a'), hard('2026-08-05', 'b'), hard('2026-08-07', 'c')],
    });
    expect(codes(plan, makeProfile({ tier: 'experienced' }))).not.toContain(
      'TOO_MANY_HARD_SESSIONS',
    );
  });

  it('enforces an absolute ceiling regardless of tier', () => {
    const plan = makePlan({
      sessions: [
        hard('2026-08-03', 'a'),
        hard('2026-08-04', 'b'),
        hard('2026-08-05', 'c'),
        hard('2026-08-06', 'd'),
        hard('2026-08-07', 'e'),
      ],
    });
    expect(codes(plan, makeProfile({ tier: 'experienced' }))).toContain('TOO_MANY_HARD_SESSIONS');
    expect(SAFETY_LIMITS.absoluteHardSessionsPerWeek).toBe(4);
  });

  it('stops a first-timer doing hard days back to back', () => {
    const plan = makePlan({ sessions: [hard('2026-08-03', 'a'), hard('2026-08-04', 'b')] });
    expect(codes(plan, makeProfile({ tier: 'first_timer' }))).toContain('CONSECUTIVE_HARD_DAYS');
  });

  it('permits back-to-back hard days for an experienced athlete', () => {
    const plan = makePlan({ sessions: [hard('2026-08-03', 'a'), hard('2026-08-04', 'b')] });
    expect(codes(plan, makeProfile({ tier: 'experienced' }))).not.toContain(
      'CONSECUTIVE_HARD_DAYS',
    );
  });
});

describe('validatePlan — rest days', () => {
  const easy = (date: string, id: string) => ({ id, date: iso(date), zone: 2 as const });

  it('requires two rest days a week for a first-timer', () => {
    const plan = makePlan({
      sessions: [
        easy('2026-08-03', 'a'),
        easy('2026-08-04', 'b'),
        easy('2026-08-05', 'c'),
        easy('2026-08-06', 'd'),
        easy('2026-08-07', 'e'),
        easy('2026-08-08', 'f'),
      ],
    });
    expect(codes(plan, makeProfile({ tier: 'first_timer' }))).toContain('NOT_ENOUGH_REST');
  });

  it('requires only one for an experienced athlete', () => {
    const plan = makePlan({
      sessions: [
        easy('2026-08-03', 'a'),
        easy('2026-08-04', 'b'),
        easy('2026-08-05', 'c'),
        easy('2026-08-06', 'd'),
        easy('2026-08-07', 'e'),
        easy('2026-08-08', 'f'),
      ],
    });
    expect(codes(plan, makeProfile({ tier: 'experienced' }))).not.toContain('NOT_ENOUGH_REST');
  });
});

describe('validatePlan — availability and blackouts', () => {
  it('never schedules on a blackout date', () => {
    const profile = makeProfile({
      blackoutDates: [{ from: iso('2026-08-05'), to: iso('2026-08-09') }],
    });
    const plan = makePlan({ sessions: [{ date: iso('2026-08-05') }] });
    expect(codes(plan, profile)).toContain('SESSION_ON_BLACKOUT_DATE');
  });

  it('never schedules on a day the athlete said they cannot train', () => {
    // Profile allows Mon/Wed/Fri/Sat; 2026-08-04 is a Tuesday.
    const plan = makePlan({ sessions: [{ date: iso('2026-08-04') }] });
    expect(codes(plan)).toContain('SESSION_ON_UNAVAILABLE_DAY');
  });

  it('never schedules a session longer than the day allows', () => {
    const profile = makeProfile({
      availability: { days: [0] as Weekday[], minutesPerDay: 60, longDays: [0] as Weekday[] },
    });
    const plan = makePlan({ sessions: [{ date: iso('2026-08-03'), plannedSeconds: 90 * 60 }] });
    expect(codes(plan, profile)).toContain('SESSION_EXCEEDS_AVAILABLE_TIME');
  });
});

describe('validatePlan — run volume', () => {
  it('caps long-run growth at 10% a week', () => {
    const plan = makePlan({
      weeks: [{}, {}],
      sessions: [
        {
          id: 'r1',
          date: iso('2026-08-08'),
          discipline: 'run',
          plannedSeconds: 3600,
          weekIndex: 0,
        },
        {
          id: 'r2',
          date: iso('2026-08-15'),
          discipline: 'run',
          plannedSeconds: 4500,
          weekIndex: 1,
        },
      ],
    });
    expect(codes(plan)).toContain('LONG_RUN_RAMP_TOO_STEEP');
  });

  it('allows the long run to return to normal after a recovery week', () => {
    const plan = makePlan({
      weeks: [{}, { isRecovery: true, targetLoad: 120 }, { targetLoad: 200 }],
      sessions: [
        {
          id: 'r1',
          date: iso('2026-08-08'),
          discipline: 'run',
          plannedSeconds: 3600,
          weekIndex: 0,
        },
        {
          id: 'r2',
          date: iso('2026-08-15'),
          discipline: 'run',
          plannedSeconds: 2400,
          weekIndex: 1,
        },
        {
          id: 'r3',
          date: iso('2026-08-22'),
          discipline: 'run',
          plannedSeconds: 3700,
          weekIndex: 2,
        },
      ],
    });
    expect(codes(plan)).not.toContain('LONG_RUN_RAMP_TOO_STEEP');
  });

  it('accepts a 10% increase', () => {
    const plan = makePlan({
      weeks: [{}, {}],
      sessions: [
        {
          id: 'r1',
          date: iso('2026-08-08'),
          discipline: 'run',
          plannedSeconds: 3600,
          weekIndex: 0,
        },
        {
          id: 'r2',
          date: iso('2026-08-15'),
          discipline: 'run',
          plannedSeconds: 3960,
          weekIndex: 1,
        },
      ],
    });
    expect(codes(plan)).not.toContain('LONG_RUN_RAMP_TOO_STEEP');
  });
});

describe('validatePlan — taper', () => {
  it('rejects a taper shorter than the distance requires', () => {
    const plan = makePlan({
      goal: makeGoal({ distance: 'half' }),
      weeks: [{ phase: 'peak' }, { phase: 'taper' }],
    });
    expect(codes(plan)).toContain('TAPER_TOO_SHORT');
  });

  it('accepts the documented minimum for the distance', () => {
    const plan = makePlan({
      goal: makeGoal({ distance: 'half' }),
      weeks: [{ phase: 'peak' }, { phase: 'taper' }, { phase: 'taper' }],
    });
    expect(codes(plan)).not.toContain('TAPER_TOO_SHORT');
  });
});

describe('validatePlan — session content', () => {
  it('requires every session to explain itself', () => {
    const plan = makePlan({ sessions: [{ purpose: '' }] });
    expect(codes(plan)).toContain('SESSION_MISSING_PURPOSE');
  });

  it('requires the steps to add up to the stated duration', () => {
    const plan = makePlan({
      sessions: [
        {
          plannedSeconds: 3600,
          steps: [{ label: 'Main set', durationSec: 600, zone: 2, cue: 'Easy' }],
        },
      ],
    });
    expect(codes(plan)).toContain('STEPS_DO_NOT_SUM');
  });

  it('counts repeats and recoveries when summing steps', () => {
    const plan = makePlan({
      sessions: [
        {
          plannedSeconds: 1000,
          steps: [
            {
              label: 'Main set',
              durationSec: 200,
              zone: 4,
              cue: 'Hard',
              repeats: 4,
              recovery: { durationSec: 100, zone: 1, cue: 'Easy' },
            },
          ],
        },
      ],
    });
    // 4 × 200 + 3 × 100 = 1100, which is within tolerance of 1000.
    expect(codes(plan)).not.toContain('STEPS_DO_NOT_SUM');
  });
});

describe('validatePlan — output shape', () => {
  it('returns an empty array for a clean plan', () => {
    expect(validatePlan(makePlan(), makeProfile())).toEqual([]);
  });

  it('gives every violation a human-readable message', () => {
    const plan = makePlan({ weeks: [{ targetLoad: 200 }, { targetLoad: 400 }] });
    for (const v of validatePlan(plan, makeProfile())) {
      expect(v.message.length).toBeGreaterThan(10);
      expect(v.code).toMatch(/^[A-Z_]+$/);
    }
  });
});

describe('assertPlanIsSafe', () => {
  it('passes a clean plan through untouched', () => {
    const plan = makePlan();
    expect(assertPlanIsSafe(plan, makeProfile())).toBe(plan);
  });

  it('throws on an unsafe plan, naming every violation', () => {
    const plan = makePlan({ weeks: [{ targetLoad: 200 }, { targetLoad: 400 }] });
    expect(() => assertPlanIsSafe(plan, makeProfile())).toThrow(/RAMP_TOO_STEEP/);
  });
});
