import { addDays, daysBetween, isBlackedOut, startOfWeek, weekdayOf } from './calendar';
import type {
  AthleteProfile,
  ExperienceTier,
  IsoDate,
  Plan,
  RaceDistance,
  Session,
  Zone,
} from './types';

/**
 * The safety rails.
 *
 * Non-negotiable limits from docs/03 § Safety rails. Every generated plan is
 * run through `assertPlanIsSafe` before it is persisted or returned — a plan
 * that breaks a rail is a bug, and shipping one is worse than an error page.
 *
 * Nothing here may be overridden by the adaptation engine or by any AI feature.
 */

export const SAFETY_LIMITS = {
  /** Maximum week-over-week growth in weekly load. */
  weeklyRampCap: 0.1,
  /** Maximum growth across any rolling four weeks. */
  rollingFourWeekCap: 0.3,
  /** A recovery week must be at least this much lighter than the week before. */
  recoveryMinReduction: 0.3,
  /** Maximum long-run duration growth per week. */
  longRunRampCap: 0.1,
  /** Hard ceiling on hard sessions per week, whatever the tier asks for. */
  absoluteHardSessionsPerWeek: 4,
  /** A session at or above this zone counts as "hard". */
  hardZoneThreshold: 4 as Zone,
  /** Tolerance when checking that steps sum to the session duration. */
  stepSumToleranceSec: 120,
} as const;

const HARD_SESSIONS_PER_WEEK: Readonly<Record<ExperienceTier, number>> = {
  first_timer: 2,
  improver: 3,
  experienced: 4,
};

const REST_DAYS_PER_WEEK: Readonly<Record<ExperienceTier, number>> = {
  first_timer: 2,
  improver: 1,
  experienced: 1,
};

/** Minimum taper length in whole weeks, by race distance. */
const MIN_TAPER_WEEKS: Readonly<Record<RaceDistance, number>> = {
  super_sprint: 1,
  sprint: 1,
  olympic: 2,
  half: 2,
  full: 3,
};

export type ViolationCode =
  | 'RAMP_TOO_STEEP'
  | 'RAMP_TOO_STEEP_ROLLING'
  | 'RECOVERY_NOT_LIGHT_ENOUGH'
  | 'TOO_MANY_HARD_SESSIONS'
  | 'CONSECUTIVE_HARD_DAYS'
  | 'NOT_ENOUGH_REST'
  | 'SESSION_ON_BLACKOUT_DATE'
  | 'SESSION_ON_UNAVAILABLE_DAY'
  | 'SESSION_EXCEEDS_AVAILABLE_TIME'
  | 'LONG_RUN_RAMP_TOO_STEEP'
  | 'TAPER_TOO_SHORT'
  | 'SESSION_MISSING_PURPOSE'
  | 'STEPS_DO_NOT_SUM';

export interface SafetyViolation {
  readonly code: ViolationCode;
  readonly message: string;
  readonly weekIndex?: number;
  readonly sessionIds?: readonly string[];
}

/** Total prescribed seconds in a session, counting repeats and recoveries. */
export function stepsTotalSeconds(session: Session): number {
  return session.steps.reduce((total, step) => {
    const repeats = step.repeats ?? 1;
    const work = step.durationSec * repeats;
    const recovery = step.recovery ? step.recovery.durationSec * Math.max(0, repeats - 1) : 0;
    return total + work + recovery;
  }, 0);
}

const isHard = (session: Session): boolean => session.zone >= SAFETY_LIMITS.hardZoneThreshold;

function groupSessionsByWeek(plan: Plan): Map<number, Session[]> {
  const byWeek = new Map<number, Session[]>();
  for (const session of plan.sessions) {
    const list = byWeek.get(session.weekIndex);
    if (list) list.push(session);
    else byWeek.set(session.weekIndex, [session]);
  }
  return byWeek;
}

/* -------------------------------------------------------------------- rails */

function checkRamp(plan: Plan, out: SafetyViolation[]): void {
  // Weeks with no training at all are time off (a blackout, a holiday), not
  // training weeks. Comparing against a zero week produces meaningless ratios,
  // so the ramp is measured across the weeks that actually contain training.
  const weeks = plan.weeks.filter((w) => w.targetLoad > 0);

  for (let i = 1; i < weeks.length; i++) {
    const prev = weeks[i - 1]!;
    const cur = weeks[i]!;
    // Coming out of a recovery week, load is expected to jump back up.
    if (cur.isRecovery || prev.isRecovery || prev.targetLoad <= 0) continue;

    const growth = cur.targetLoad / prev.targetLoad - 1;
    if (growth > SAFETY_LIMITS.weeklyRampCap + 1e-9) {
      out.push({
        code: 'RAMP_TOO_STEEP',
        weekIndex: cur.index,
        message: `Week ${String(cur.index + 1)} increases load by ${(growth * 100).toFixed(1)}%, above the ${String(SAFETY_LIMITS.weeklyRampCap * 100)}% cap.`,
      });
    }
  }

  // Rolling four-week growth compares block TOTALS, not single weeks. Comparing
  // individual weeks reads a recovery week as a spike in the block that follows
  // it, which is the plan working rather than a problem.
  const sumLoad = (from: number, to: number) =>
    weeks.slice(from, to).reduce((total, w) => total + w.targetLoad, 0);

  for (let i = 7; i < weeks.length; i++) {
    const recent = sumLoad(i - 3, i + 1);
    const earlier = sumLoad(i - 7, i - 3);
    if (earlier <= 0) continue;
    const growth = recent / earlier - 1;
    if (growth > SAFETY_LIMITS.rollingFourWeekCap + 1e-9) {
      out.push({
        code: 'RAMP_TOO_STEEP_ROLLING',
        weekIndex: weeks[i]!.index,
        message: `The four training weeks ending at week ${String(weeks[i]!.index + 1)} are ${(growth * 100).toFixed(1)}% heavier than the four before them, over the ${String(SAFETY_LIMITS.rollingFourWeekCap * 100)}% rolling cap.`,
      });
    }
  }
}

function checkRecoveryWeeks(plan: Plan, out: SafetyViolation[]): void {
  const weeks = plan.weeks.filter((w) => w.targetLoad > 0);
  weeks.forEach((week, i) => {
    if (!week.isRecovery || i === 0) return;
    const prev = weeks[i - 1]!;
    if (prev.targetLoad <= 0) return;
    const reduction = 1 - week.targetLoad / prev.targetLoad;
    if (reduction < SAFETY_LIMITS.recoveryMinReduction - 1e-9) {
      out.push({
        code: 'RECOVERY_NOT_LIGHT_ENOUGH',
        weekIndex: week.index,
        message: `Recovery week ${String(week.index + 1)} is only ${(reduction * 100).toFixed(0)}% lighter than the week before; it must be at least ${String(SAFETY_LIMITS.recoveryMinReduction * 100)}%.`,
      });
    }
  });
}

function checkHardSessions(plan: Plan, profile: AthleteProfile, out: SafetyViolation[]): void {
  const cap = Math.min(
    HARD_SESSIONS_PER_WEEK[profile.tier],
    SAFETY_LIMITS.absoluteHardSessionsPerWeek,
  );

  for (const [weekIndex, sessions] of groupSessionsByWeek(plan)) {
    const hard = sessions.filter(isHard);
    if (hard.length > cap) {
      out.push({
        code: 'TOO_MANY_HARD_SESSIONS',
        weekIndex,
        sessionIds: hard.map((s) => s.id),
        message: `Week ${String(weekIndex + 1)} has ${String(hard.length)} hard sessions; the limit for this athlete is ${String(cap)}.`,
      });
    }
  }

  if (profile.tier !== 'first_timer') return;

  const hardDates = [...new Set(plan.sessions.filter(isHard).map((s) => s.date))].sort();
  for (let i = 1; i < hardDates.length; i++) {
    if (daysBetween(hardDates[i - 1]!, hardDates[i]!) === 1) {
      out.push({
        code: 'CONSECUTIVE_HARD_DAYS',
        sessionIds: plan.sessions
          .filter((s) => isHard(s) && (s.date === hardDates[i - 1] || s.date === hardDates[i]))
          .map((s) => s.id),
        message: `Hard sessions on ${String(hardDates[i - 1])} and ${String(hardDates[i])} run back to back, which is too much for a first-timer.`,
      });
    }
  }
}

function checkRestDays(plan: Plan, profile: AthleteProfile, out: SafetyViolation[]): void {
  const required = REST_DAYS_PER_WEEK[profile.tier];

  const byWeekStart = new Map<IsoDate, Set<IsoDate>>();
  for (const session of plan.sessions) {
    const key = startOfWeek(session.date);
    const set = byWeekStart.get(key) ?? new Set<IsoDate>();
    set.add(session.date);
    byWeekStart.set(key, set);
  }

  for (const [weekStart, trainingDays] of byWeekStart) {
    const rest = 7 - trainingDays.size;
    if (rest < required) {
      out.push({
        code: 'NOT_ENOUGH_REST',
        message: `The week of ${String(weekStart)} has only ${String(rest)} rest day(s); this athlete needs ${String(required)}.`,
      });
    }
  }
}

function checkAvailability(plan: Plan, profile: AthleteProfile, out: SafetyViolation[]): void {
  const allowedDays = new Set(profile.availability.days);
  const maxSeconds = profile.availability.minutesPerDay * 60;

  for (const session of plan.sessions) {
    if (isBlackedOut(session.date, profile.blackoutDates)) {
      out.push({
        code: 'SESSION_ON_BLACKOUT_DATE',
        sessionIds: [session.id],
        message: `"${session.title}" is scheduled on ${String(session.date)}, which the athlete blacked out.`,
      });
    }

    if (!allowedDays.has(weekdayOf(session.date))) {
      out.push({
        code: 'SESSION_ON_UNAVAILABLE_DAY',
        sessionIds: [session.id],
        message: `"${session.title}" is scheduled on ${String(session.date)}, a day the athlete said they cannot train.`,
      });
    }

    if (session.plannedSeconds > maxSeconds) {
      out.push({
        code: 'SESSION_EXCEEDS_AVAILABLE_TIME',
        sessionIds: [session.id],
        message: `"${session.title}" is ${String(Math.round(session.plannedSeconds / 60))} minutes, more than the ${String(profile.availability.minutesPerDay)} available that day.`,
      });
    }
  }
}

function checkLongRunRamp(plan: Plan, out: SafetyViolation[]): void {
  const longestRunByWeek = new Map<number, Session>();
  for (const session of plan.sessions) {
    if (session.discipline !== 'run') continue;
    const current = longestRunByWeek.get(session.weekIndex);
    if (!current || session.plannedSeconds > current.plannedSeconds) {
      longestRunByWeek.set(session.weekIndex, session);
    }
  }

  const weekIndexes = [...longestRunByWeek.keys()].sort((a, b) => a - b);
  for (let i = 1; i < weekIndexes.length; i++) {
    const prevIndex = weekIndexes[i - 1]!;
    const curIndex = weekIndexes[i]!;
    if (curIndex - prevIndex !== 1) continue;

    const prev = longestRunByWeek.get(prevIndex)!;
    const cur = longestRunByWeek.get(curIndex)!;
    // Same exemption as the load ramp: a recovery week is deliberately short,
    // and returning to normal afterwards is the plan working, not a jump.
    if (plan.weeks[curIndex]?.isRecovery || plan.weeks[prevIndex]?.isRecovery) continue;

    const growth = cur.plannedSeconds / prev.plannedSeconds - 1;
    if (growth > SAFETY_LIMITS.longRunRampCap + 1e-9) {
      out.push({
        code: 'LONG_RUN_RAMP_TOO_STEEP',
        weekIndex: curIndex,
        sessionIds: [cur.id],
        message: `The long run grows ${(growth * 100).toFixed(0)}% into week ${String(curIndex + 1)}; running volume must not rise more than ${String(SAFETY_LIMITS.longRunRampCap * 100)}% a week.`,
      });
    }
  }
}

function checkTaper(plan: Plan, out: SafetyViolation[]): void {
  if (plan.goal.mode === 'fitness') return;
  const required = MIN_TAPER_WEEKS[plan.goal.distance];
  const taperWeeks = plan.weeks.filter((w) => w.phase === 'taper').length;
  if (taperWeeks < required) {
    out.push({
      code: 'TAPER_TOO_SHORT',
      message: `A ${plan.goal.distance.replace('_', ' ')} needs at least ${String(required)} taper week(s); this plan has ${String(taperWeeks)}.`,
    });
  }
}

function checkSessionContent(plan: Plan, out: SafetyViolation[]): void {
  for (const session of plan.sessions) {
    if (session.purpose.trim().length === 0) {
      out.push({
        code: 'SESSION_MISSING_PURPOSE',
        sessionIds: [session.id],
        message: `"${session.title}" has no purpose text; every session must explain why it exists.`,
      });
    }

    const total = stepsTotalSeconds(session);
    if (Math.abs(total - session.plannedSeconds) > SAFETY_LIMITS.stepSumToleranceSec) {
      out.push({
        code: 'STEPS_DO_NOT_SUM',
        sessionIds: [session.id],
        message: `"${session.title}" says ${String(Math.round(session.plannedSeconds / 60))} minutes but its steps add up to ${String(Math.round(total / 60))}.`,
      });
    }
  }
}

/* ------------------------------------------------------------------ public */

/** Returns every rail the plan breaks. An empty array means the plan is safe. */
export function validatePlan(plan: Plan, profile: AthleteProfile): SafetyViolation[] {
  const violations: SafetyViolation[] = [];
  checkRamp(plan, violations);
  checkRecoveryWeeks(plan, violations);
  checkHardSessions(plan, profile, violations);
  checkRestDays(plan, profile, violations);
  checkAvailability(plan, profile, violations);
  checkLongRunRamp(plan, violations);
  checkTaper(plan, violations);
  checkSessionContent(plan, violations);
  return violations;
}

export class UnsafePlanError extends Error {
  readonly violations: readonly SafetyViolation[];

  constructor(violations: readonly SafetyViolation[]) {
    const detail = violations.map((v) => `${v.code}: ${v.message}`).join('\n  ');
    super(`Generated plan breaks ${String(violations.length)} safety rail(s):\n  ${detail}`);
    this.name = 'UnsafePlanError';
    this.violations = violations;
  }
}

/**
 * The gate every plan passes through before it leaves the domain.
 * Returns the plan unchanged so it can be used inline.
 */
export function assertPlanIsSafe(plan: Plan, profile: AthleteProfile): Plan {
  const violations = validatePlan(plan, profile);
  if (violations.length > 0) throw new UnsafePlanError(violations);
  return plan;
}

/** Exported for the generator, which must respect the same taper minimums. */
export function minimumTaperWeeks(distance: RaceDistance): number {
  return MIN_TAPER_WEEKS[distance];
}

/** Exported for the generator, which sizes weeks against the same tier caps. */
export function hardSessionsAllowed(tier: ExperienceTier): number {
  return Math.min(HARD_SESSIONS_PER_WEEK[tier], SAFETY_LIMITS.absoluteHardSessionsPerWeek);
}

export function restDaysRequired(tier: ExperienceTier): number {
  return REST_DAYS_PER_WEEK[tier];
}

/** Exported for tests and the generator: the day after a given date. */
export function nextDay(date: IsoDate): IsoDate {
  return addDays(date, 1);
}
