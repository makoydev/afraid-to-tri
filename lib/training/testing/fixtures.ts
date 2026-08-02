import type {
  AthleteProfile,
  IsoDate,
  Plan,
  PlanWeek,
  RaceGoal,
  Session,
  Weekday,
  Zone,
} from '../types';
import { addWeeks } from '../calendar';

/**
 * Builders for tests. Every field has a sensible default so a test only states
 * the thing it is actually about.
 *
 * Excluded from coverage — this is scaffolding, not product code.
 */

export const iso = (s: string): IsoDate => s as IsoDate;

export function makeProfile(overrides: Partial<AthleteProfile> = {}): AthleteProfile {
  return {
    tier: 'first_timer',
    swim: { continuousMeters: 200, track: 'develop' },
    bike: { continuousSeconds: 2400 },
    run: { continuousSeconds: 1200 },
    availability: {
      days: [0, 2, 4, 5] as Weekday[],
      minutesPerDay: 75,
      longDays: [5] as Weekday[],
    },
    confidence: { swim: 2, bike: 2, run: 2 },
    blackoutDates: [],
    ...overrides,
  };
}

export function makeGoal(overrides: Partial<RaceGoal> = {}): RaceGoal {
  return {
    mode: 'race',
    distance: 'sprint',
    raceDate: iso('2026-11-07'),
    raceName: 'Riverside Sprint Triathlon',
    ...overrides,
  };
}

export function makeWeek(overrides: Partial<PlanWeek> = {}): PlanWeek {
  return {
    index: 0,
    startDate: iso('2026-08-03'),
    phase: 'base',
    isRecovery: false,
    targetLoad: 200,
    targetSeconds: 4 * 60 * 60,
    focus: 'Aerobic base and swim technique',
    ...overrides,
  };
}

export function makeSession(overrides: Partial<Session> = {}): Session {
  const zone: Zone = overrides.zone ?? 2;
  return {
    id: 'session-1',
    date: iso('2026-08-03'),
    weekIndex: 0,
    discipline: 'bike',
    templateId: 'bike.endurance',
    title: 'Easy ride',
    purpose: 'Builds the aerobic base everything else sits on.',
    plannedSeconds: 45 * 60,
    plannedLoad: 40,
    zone,
    steps: [{ label: 'Main set', durationSec: 45 * 60, zone, cue: 'Comfortable' }],
    tags: [],
    status: 'planned',
    ...overrides,
  };
}

export interface PlanShape {
  readonly startDate?: IsoDate;
  readonly weeks?: readonly Partial<PlanWeek>[];
  readonly sessions?: readonly Partial<Session>[];
  readonly goal?: RaceGoal;
}

export function makePlan(shape: PlanShape = {}): Plan {
  const startDate = shape.startDate ?? iso('2026-08-03');
  const goal = shape.goal ?? makeGoal();

  // The default is a minimal plan that passes every safety rail, so a test
  // only has to describe the thing it is actually about.
  const defaultWeeks: readonly Partial<PlanWeek>[] = [
    { phase: 'base', targetLoad: 200 },
    { phase: 'taper', targetLoad: 120, targetSeconds: 2 * 60 * 60 },
  ];

  const weeks: PlanWeek[] = (shape.weeks ?? defaultWeeks).map((w, index) =>
    makeWeek({ index, startDate: addWeeks(startDate, index), ...w }),
  );

  const sessions: Session[] = (shape.sessions ?? []).map((s, i) =>
    makeSession({ id: `session-${String(i + 1)}`, ...s }),
  );

  return {
    startDate,
    endDate: addWeeks(startDate, weeks.length),
    goal,
    totalWeeks: weeks.length,
    weeks,
    sessions,
    generatorVersion: 'test',
  };
}
