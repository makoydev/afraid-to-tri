import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { generatePlan, GENERATOR_VERSION } from './generate';
import { validatePlan } from './safety';
import { stepsTotalSeconds } from './safety';
import { addWeeks, daysBetween, weekdayOf } from './calendar';
import { makeProfile, makeGoal, iso } from './testing/fixtures';
import type { AthleteProfile, ExperienceTier, RaceDistance, Weekday } from './types';

const TODAY = iso('2026-08-03'); // a Monday

const okPlan = (input: Parameters<typeof generatePlan>[0]) => {
  const result = generatePlan(input);
  if (!result.ok) throw new Error(`expected a plan, got ${result.reason}`);
  return result.plan;
};

describe('feasibility', () => {
  it('refuses an eight-week run-up to a 70.3 rather than producing a plan', () => {
    const result = generatePlan({
      profile: makeProfile(),
      goal: makeGoal({ distance: 'half', raceDate: addWeeks(TODAY, 8) }),
      today: TODAY,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('runway_too_short');
    expect(result.availableWeeks).toBe(8);
    expect(result.minimumWeeks).toBeGreaterThan(8);
  });

  it('offers concrete alternatives instead of a dead end', () => {
    const result = generatePlan({
      profile: makeProfile(),
      goal: makeGoal({ distance: 'half', raceDate: addWeeks(TODAY, 8) }),
      today: TODAY,
    });
    if (result.ok) throw new Error('expected refusal');
    const types = result.options.map((o) => o.type);
    expect(types).toContain('shorter_distance');
    expect(types).toContain('later_date');
    expect(result.options.every((o) => o.label.length > 5)).toBe(true);
  });

  it('never blames the athlete in the refusal message', () => {
    const result = generatePlan({
      profile: makeProfile(),
      goal: makeGoal({ distance: 'full', raceDate: addWeeks(TODAY, 6) }),
      today: TODAY,
    });
    if (result.ok) throw new Error('expected refusal');
    expect(result.message).not.toMatch(/fail|not fit|unable|too slow/i);
    expect(result.message.length).toBeGreaterThan(20);
  });

  it('suggests a later date that actually clears the minimum', () => {
    const result = generatePlan({
      profile: makeProfile(),
      goal: makeGoal({ distance: 'olympic', raceDate: addWeeks(TODAY, 5) }),
      today: TODAY,
    });
    if (result.ok) throw new Error('expected refusal');
    const later = result.options.find((o) => o.type === 'later_date');
    expect(later).toBeDefined();
    if (later?.type !== 'later_date') return;
    const retry = generatePlan({
      profile: makeProfile(),
      goal: makeGoal({ distance: 'olympic', raceDate: later.suggestedDate }),
      today: TODAY,
    });
    expect(retry.ok).toBe(true);
  });

  it('accepts a comfortable run-up', () => {
    const result = generatePlan({
      profile: makeProfile(),
      goal: makeGoal({ distance: 'sprint', raceDate: addWeeks(TODAY, 14) }),
      today: TODAY,
    });
    expect(result.ok).toBe(true);
  });
});

describe('plan shape', () => {
  const plan = () =>
    okPlan({
      profile: makeProfile(),
      goal: makeGoal({ distance: 'sprint', raceDate: addWeeks(TODAY, 14) }),
      today: TODAY,
    });

  it('starts on the Monday of the current week', () => {
    expect(weekdayOf(plan().startDate)).toBe(0);
  });

  it('runs up to the race', () => {
    const p = plan();
    expect(p.totalWeeks).toBe(14);
    expect(p.weeks).toHaveLength(14);
  });

  it('ends in a taper', () => {
    const p = plan();
    expect(p.weeks.at(-1)!.phase).toBe('taper');
  });

  it('orders phases prep → base → build → peak → taper without going backwards', () => {
    const order = ['prep', 'base', 'build', 'peak', 'taper'];
    const seen = plan().weeks.map((w) => order.indexOf(w.phase));
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
    }
  });

  it('gives every week a plain-English focus', () => {
    for (const week of plan().weeks) expect(week.focus.length).toBeGreaterThan(10);
  });

  it('records the generator version so any plan can be reproduced', () => {
    expect(plan().generatorVersion).toBe(GENERATOR_VERSION);
  });

  it('is deterministic — the same input produces an identical plan', () => {
    const input = {
      profile: makeProfile(),
      goal: makeGoal({ distance: 'sprint', raceDate: addWeeks(TODAY, 14) }),
      today: TODAY,
    };
    expect(JSON.stringify(okPlan(input))).toBe(JSON.stringify(okPlan(input)));
  });
});

describe('sessions', () => {
  const plan = () =>
    okPlan({
      profile: makeProfile(),
      goal: makeGoal({ distance: 'sprint', raceDate: addWeeks(TODAY, 14) }),
      today: TODAY,
    });

  it('covers all three disciplines every single week', () => {
    const p = plan();
    for (const week of p.weeks) {
      const disciplines = new Set(
        p.sessions.filter((s) => s.weekIndex === week.index).map((s) => s.discipline),
      );
      const hasSwim = disciplines.has('swim');
      const hasBike = disciplines.has('bike') || disciplines.has('brick');
      const hasRun = disciplines.has('run') || disciplines.has('brick');
      expect({ week: week.index, hasSwim, hasBike, hasRun }).toEqual({
        week: week.index,
        hasSwim: true,
        hasBike: true,
        hasRun: true,
      });
    }
  });

  it('gives every session a unique id', () => {
    const ids = plan().sessions.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('makes every session explain itself', () => {
    for (const s of plan().sessions) expect(s.purpose.length).toBeGreaterThan(15);
  });

  it('builds steps that sum to the stated duration', () => {
    for (const s of plan().sessions) {
      expect(Math.abs(stepsTotalSeconds(s) - s.plannedSeconds)).toBeLessThanOrEqual(120);
    }
  });

  it('introduces brick sessions once the build phase starts, and not before', () => {
    const p = plan();
    const bricks = p.sessions.filter((s) => s.discipline === 'brick');
    expect(bricks.length).toBeGreaterThan(0);
    for (const brick of bricks) {
      expect(['build', 'peak']).toContain(p.weeks[brick.weekIndex]!.phase);
    }
  });

  it('schedules open-water practice before an open-water race', () => {
    const p = plan();
    const openWater = p.sessions.filter((s) => s.tags.includes('openwater'));
    expect(openWater.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps the great majority of training easy', () => {
    const p = plan();
    const easy = p.sessions.filter((s) => s.zone <= 2).length;
    expect(easy / p.sessions.length).toBeGreaterThan(0.55);
  });
});

describe('constraints', () => {
  it('only schedules on days the athlete said they can train', () => {
    const profile = makeProfile({
      availability: { days: [1, 3] as Weekday[], minutesPerDay: 60, longDays: [3] as Weekday[] },
    });
    const p = okPlan({
      profile,
      goal: makeGoal({ distance: 'sprint', raceDate: addWeeks(TODAY, 14) }),
      today: TODAY,
    });
    for (const s of p.sessions) expect([1, 3]).toContain(weekdayOf(s.date));
  });

  it('leaves blackout dates completely empty', () => {
    const profile = makeProfile({
      blackoutDates: [{ from: iso('2026-09-07'), to: iso('2026-09-20') }],
    });
    const p = okPlan({
      profile,
      goal: makeGoal({ distance: 'sprint', raceDate: addWeeks(TODAY, 14) }),
      today: TODAY,
    });
    const inBlackout = p.sessions.filter((s) => s.date >= '2026-09-07' && s.date <= '2026-09-20');
    expect(inBlackout).toEqual([]);
  });

  it('never plans a session longer than the day allows', () => {
    const profile = makeProfile({
      availability: {
        days: [0, 2, 4, 5] as Weekday[],
        minutesPerDay: 45,
        longDays: [5] as Weekday[],
      },
    });
    const p = okPlan({
      profile,
      goal: makeGoal({ distance: 'sprint', raceDate: addWeeks(TODAY, 14) }),
      today: TODAY,
    });
    for (const s of p.sessions) expect(s.plannedSeconds).toBeLessThanOrEqual(45 * 60);
  });

  it('plans below stated availability, leaving slack for bad weeks', () => {
    const profile = makeProfile({
      availability: {
        days: [0, 2, 4, 5] as Weekday[],
        minutesPerDay: 75,
        longDays: [5] as Weekday[],
      },
    });
    const p = okPlan({
      profile,
      goal: makeGoal({ distance: 'sprint', raceDate: addWeeks(TODAY, 14) }),
      today: TODAY,
    });
    const ceiling = 4 * 75 * 60;
    for (const week of p.weeks) expect(week.targetSeconds).toBeLessThanOrEqual(ceiling);
  });

  it('places the longest session of the week on a stated long day', () => {
    const p = okPlan({
      profile: makeProfile(),
      goal: makeGoal({ distance: 'sprint', raceDate: addWeeks(TODAY, 14) }),
      today: TODAY,
    });
    for (const week of p.weeks) {
      const sessions = p.sessions.filter((s) => s.weekIndex === week.index);
      if (sessions.length === 0) continue;
      const longest = sessions.reduce((a, b) => (b.plannedSeconds > a.plannedSeconds ? b : a));
      expect([5, 6]).toContain(weekdayOf(longest.date));
    }
  });
});

describe('goal modes', () => {
  it('builds a rolling block when there is no race', () => {
    const p = okPlan({
      profile: makeProfile(),
      goal: { mode: 'fitness', weeks: 12 },
      today: TODAY,
    });
    expect(p.totalWeeks).toBe(12);
    expect(p.weeks.every((w) => w.phase !== 'taper')).toBe(true);
  });

  it('caps intensity in finish-only mode', () => {
    const race = okPlan({
      profile: makeProfile(),
      goal: makeGoal({ distance: 'sprint', raceDate: addWeeks(TODAY, 14), mode: 'race' }),
      today: TODAY,
    });
    const finish = okPlan({
      profile: makeProfile(),
      goal: makeGoal({ distance: 'sprint', raceDate: addWeeks(TODAY, 14), mode: 'finish_only' }),
      today: TODAY,
    });
    const maxZone = (p: typeof race) => Math.max(...p.sessions.map((s) => s.zone));
    expect(maxZone(finish)).toBeLessThan(maxZone(race));
  });
});

describe('safety — every generated plan passes the rails', () => {
  it('holds for the standard case', () => {
    const profile = makeProfile();
    const p = okPlan({
      profile,
      goal: makeGoal({ distance: 'sprint', raceDate: addWeeks(TODAY, 14) }),
      today: TODAY,
    });
    expect(validatePlan(p, profile)).toEqual([]);
  });

  it('holds across randomized athlete profiles and goals', () => {
    const tiers: ExperienceTier[] = ['first_timer', 'improver', 'experienced'];
    const distances: RaceDistance[] = ['super_sprint', 'sprint', 'olympic', 'half', 'full'];

    fc.assert(
      fc.property(
        fc.constantFrom(...tiers),
        fc.constantFrom(...distances),
        fc.integer({ min: 4, max: 52 }), // weeks of runway, including infeasible ones
        fc.uniqueArray(fc.integer({ min: 0, max: 6 }), { minLength: 2, maxLength: 7 }),
        fc.integer({ min: 20, max: 240 }), // minutes per day
        fc.integer({ min: 0, max: 6 }), // which available day is the long day
        (tier, distance, weeks, days, minutes, longDayPick) => {
          const sorted = [...days].sort((a, b) => a - b) as Weekday[];
          const profile: AthleteProfile = makeProfile({
            tier,
            availability: {
              days: sorted,
              minutesPerDay: minutes,
              longDays: [sorted[longDayPick % sorted.length]!],
            },
          });
          const result = generatePlan({
            profile,
            goal: makeGoal({ distance, raceDate: addWeeks(TODAY, weeks) }),
            today: TODAY,
          });
          if (!result.ok) return true; // an honest refusal is a valid outcome
          const violations = validatePlan(result.plan, profile);
          if (violations.length > 0) {
            throw new Error(
              `${tier}/${distance}/${String(weeks)}w/[${sorted.join(',')}]/${String(minutes)}m → ` +
                violations.map((v) => v.code).join(','),
            );
          }
          return true;
        },
      ),
      { numRuns: 500 },
    );
  });
});

describe('race-week handling', () => {
  it('does not schedule training on race day itself', () => {
    const raceDate = addWeeks(TODAY, 14);
    const p = okPlan({
      profile: makeProfile(),
      goal: makeGoal({ distance: 'sprint', raceDate }),
      today: TODAY,
    });
    expect(p.sessions.some((s) => s.date === raceDate)).toBe(false);
  });

  it('never schedules a session after race day', () => {
    const raceDate = addWeeks(TODAY, 14);
    const p = okPlan({
      profile: makeProfile(),
      goal: makeGoal({ distance: 'sprint', raceDate }),
      today: TODAY,
    });
    for (const s of p.sessions) expect(daysBetween(s.date, raceDate)).toBeGreaterThan(0);
  });
});
