import { addDays, addWeeks, daysBetween, isBlackedOut, startOfWeek } from './calendar';
import { plannedLoad } from './load';
import {
  SAFETY_LIMITS,
  assertPlanIsSafe,
  hardSessionsAllowed,
  minimumTaperWeeks,
  restDaysRequired,
} from './safety';
import { TEMPLATES, type TemplateId, type WorkoutTemplate } from './templates';
import type {
  AthleteProfile,
  ExperienceTier,
  FeasibilityFailure,
  FeasibilityOption,
  GenerateResult,
  Goal,
  IsoDate,
  Plan,
  PlanPhase,
  PlanWeek,
  RaceDistance,
  Session,
  Step,
  Weekday,
  Zone,
} from './types';

/**
 * The plan generator.
 *
 * Deterministic and I/O-free: the same input always produces a byte-identical
 * plan, which is what makes `plans.generator_input` a reproduction recipe and
 * lets us regression-test changes against real user inputs (ADR-0006).
 *
 * The output is run through the safety rails before it is returned. A plan that
 * breaks a rail throws rather than shipping.
 */

/** Bump on any behavioural change so stored plans stay reproducible. */
export const GENERATOR_VERSION = '1.0.0';

/* --------------------------------------------------------------- constants */

const MIN_WEEKS: Readonly<Record<RaceDistance, number>> = {
  super_sprint: 4,
  sprint: 6,
  olympic: 10,
  half: 16,
  full: 24,
};

const DISTANCE_ORDER: readonly RaceDistance[] = [
  'super_sprint',
  'sprint',
  'olympic',
  'half',
  'full',
];

const DISTANCE_LABEL: Readonly<Record<RaceDistance, string>> = {
  super_sprint: 'super sprint',
  sprint: 'sprint',
  olympic: 'Olympic',
  half: 'half (70.3)',
  full: 'full distance',
};

/**
 * Weekly ramp by tier. Deliberately below the 10% safety cap — the rail is the
 * hard limit, not the target.
 */
const RAMP_RATE: Readonly<Record<ExperienceTier, number>> = {
  first_timer: 0.05,
  improver: 0.06,
  experienced: 0.07,
};

/** Plan to 90% of stated availability. Athletes overestimate their free time. */
const AVAILABILITY_UTILISATION = 0.9;

/**
 * A recovery week takes this fraction of the preceding week. Comfortably below
 * the 0.7 the rail demands, so rounding never lands on the boundary.
 */
const RECOVERY_FACTOR = 0.58;

/** Volume retained per week of complete time off, on return. */
const DETRAIN_PER_OFF_WEEK = 0.8;

/** Build:recovery cycling. Every Nth week is easy. */
const RECOVERY_CYCLE = 4;

/** Safety margins: stay clear of the rails rather than sitting exactly on them. */
const RAMP_MARGIN = 0.98;
const ROLLING_MARGIN = 0.96;
const LONG_RUN_MARGIN = 0.98;

const PHASE_FOCUS: Readonly<Record<PlanPhase, string>> = {
  prep: 'Getting moving and building the habit',
  base: 'Aerobic base and swim technique',
  build: 'Race-specific fitness — bricks start here',
  peak: 'Sharpening up at race effort',
  taper: 'Shedding fatigue while keeping fitness',
};

const RECOVERY_FOCUS = 'Recovery week — deliberately easy, and not optional';

/* ------------------------------------------------------------------- input */

export interface GenerateInput {
  readonly profile: AthleteProfile;
  readonly goal: Goal;
  /** Explicit, never read from the clock (ADR-0006). */
  readonly today: IsoDate;
}

/* ------------------------------------------------------------- feasibility */

function refuse(
  distance: RaceDistance,
  availableWeeks: number,
  startDate: IsoDate,
): FeasibilityFailure {
  const minimumWeeks = MIN_WEEKS[distance];

  const options: FeasibilityOption[] = [];

  const shorter = [...DISTANCE_ORDER]
    .slice(0, DISTANCE_ORDER.indexOf(distance))
    .reverse()
    .find((d) => MIN_WEEKS[d] <= availableWeeks);
  if (shorter) {
    options.push({
      type: 'shorter_distance',
      distance: shorter,
      label: `Do the ${DISTANCE_LABEL[shorter]} instead — there is time to train for that properly`,
    });
  }

  options.push({
    type: 'later_date',
    suggestedDate: addWeeks(startDate, minimumWeeks + 2),
    label: `Pick a race about ${String(minimumWeeks + 2)} weeks out and do this one properly`,
  });

  options.push({
    type: 'finish_only',
    label: 'Train to finish rather than to race, and accept it will be a long day',
  });

  return {
    ok: false,
    reason: 'runway_too_short',
    minimumWeeks,
    availableWeeks,
    message:
      `That is ${String(availableWeeks)} weeks to a ${DISTANCE_LABEL[distance]}. Getting there safely takes at least ` +
      `${String(minimumWeeks)}. Here is what would work instead.`,
    options,
  };
}

/* ------------------------------------------------------------------ phases */

function blockPhases(totalWeeks: number, goal: Goal, tier: ExperienceTier): PlanPhase[] {
  if (goal.mode === 'fitness') {
    // A rolling block with no race to work back from: base, then build.
    const base = Math.max(1, Math.round(totalWeeks * 0.6));
    return [
      ...Array<PlanPhase>(base).fill('base'),
      ...Array<PlanPhase>(totalWeeks - base).fill('build'),
    ];
  }

  const taper = minimumTaperWeeks(goal.distance);
  const remaining = Math.max(1, totalWeeks - taper);

  const prep = tier === 'first_timer' && remaining > 8 ? 2 : 0;
  let peak = Math.max(1, Math.round(remaining * 0.11));
  let build = Math.max(1, Math.round(remaining * 0.33));
  let base = remaining - prep - peak - build;

  // If the runway is tight, compress in order: prep, then peak, then build.
  while (base < 1 && (peak > 1 || build > 1)) {
    if (peak > 1) peak -= 1;
    else build -= 1;
    base = remaining - prep - peak - build;
  }
  base = Math.max(0, base);

  const phases: PlanPhase[] = [
    ...Array<PlanPhase>(prep).fill('prep'),
    ...Array<PlanPhase>(base).fill('base'),
    ...Array<PlanPhase>(build).fill('build'),
    ...Array<PlanPhase>(peak).fill('peak'),
    ...Array<PlanPhase>(taper).fill('taper'),
  ];

  // Pad or trim to length, always keeping the taper at the end.
  while (phases.length < totalWeeks) phases.unshift('base');
  return phases.slice(phases.length - totalWeeks);
}

/* ---------------------------------------------------------------- sessions */

interface SessionSpec {
  readonly templateId: TemplateId;
  /** Relative share of the week's volume, before scaling. */
  readonly weight: number;
  /** Position in the week's priority order; higher is dropped first. */
  readonly priority: number;
  readonly long?: boolean;
}

/**
 * Absolute floor when shrinking a session to fit a load cap. Below this it is
 * not a session, and we drop it instead.
 */
const ABSOLUTE_MIN_SESSION_SEC = 15 * 60;

/** Normal weeks keep all three disciplines. */
const MIN_SESSIONS_PER_WEEK = 3;

/**
 * A recovery week may go down to a single session. For an athlete training two
 * short sessions a week, every session is already at the minimum length, so
 * fewer sessions is the only way a recovery week can actually be lighter.
 */
const MIN_SESSIONS_RECOVERY_WEEK = 1;

/**
 * The easier session to fall back to when a week cannot afford the load.
 * A brick is zone 3, so for an athlete with very little time it can cost more
 * than the week allows; the long ride is the honest substitute.
 */
const EASY_SUBSTITUTE: Partial<Record<TemplateId, TemplateId>> = {
  'bike.threshold': 'bike.endurance',
  'bike.tempo': 'bike.endurance',
  'run.intervals': 'run.easy',
  'swim.threshold': 'swim.endurance',
  'brick.bikerun': 'bike.long',
};

/**
 * The week's session mix, in priority order. Only the first `n` are used, so
 * the three disciplines are always covered before any second session is added.
 */
function weekSpecs(
  phase: PlanPhase,
  isRecovery: boolean,
  sessionCount: number,
  opts: { openWater: boolean; brick: boolean; finishOnly: boolean; hardBudget: number },
): SessionSpec[] {
  const easyOnly = phase === 'prep' || isRecovery || opts.finishOnly;

  const swimPrimary: TemplateId = opts.openWater
    ? 'swim.openwater'
    : phase === 'prep'
      ? 'swim.technique'
      : 'swim.endurance';

  const bikeQuality: TemplateId = easyOnly
    ? 'bike.endurance'
    : phase === 'build'
      ? 'bike.threshold'
      : phase === 'peak'
        ? 'bike.tempo'
        : 'bike.endurance';

  const runQuality: TemplateId = easyOnly
    ? 'run.easy'
    : phase === 'build' || phase === 'peak'
      ? 'run.intervals'
      : 'run.easy';

  const ordered: SessionSpec[] = [
    { templateId: swimPrimary, weight: 1.0, priority: 0 },
    opts.brick
      ? { templateId: 'brick.bikerun', weight: 2.1, priority: 1, long: true }
      : { templateId: 'bike.long', weight: 2.0, priority: 1, long: true },
    { templateId: 'run.long', weight: 1.4, priority: 2, long: true },
    { templateId: bikeQuality, weight: 1.3, priority: 3 },
    { templateId: 'swim.endurance', weight: 0.9, priority: 4 },
    { templateId: runQuality, weight: 1.0, priority: 5 },
    { templateId: 'strength.core', weight: 0.5, priority: 6 },
  ];

  // Downgrade quality sessions once the tier's hard-session budget is spent.
  let hardUsed = 0;
  return ordered.slice(0, sessionCount).map((spec) => {
    const template = TEMPLATES[spec.templateId];
    if (template.zone < SAFETY_LIMITS.hardZoneThreshold) return spec;
    if (hardUsed < opts.hardBudget) {
      hardUsed += 1;
      return spec;
    }
    const substitute = EASY_SUBSTITUTE[spec.templateId];
    return substitute ? { ...spec, templateId: substitute } : spec;
  });
}

/* --------------------------------------------------------------- placement */

/** Days this week the athlete can actually train, in weekday order. */
function candidateDays(
  weekStart: IsoDate,
  profile: AthleteProfile,
  raceDate: IsoDate | null,
): { weekday: Weekday; date: IsoDate }[] {
  return [...profile.availability.days]
    .sort((a, b) => a - b)
    .map((weekday) => ({ weekday, date: addDays(weekStart, weekday) }))
    .filter(({ date }) => !isBlackedOut(date, profile.blackoutDates))
    .filter(({ date }) => raceDate === null || date < raceDate);
}

interface Placement {
  readonly spec: SessionSpec;
  readonly date: IsoDate;
  readonly seconds: number;
  readonly template: WorkoutTemplate;
}

/**
 * Assigns sessions to days: longest onto a long day, hard sessions spread as
 * far apart as possible (including across the week boundary), rest fill in.
 */
function placeSessions(
  sized: { spec: SessionSpec; seconds: number; template: WorkoutTemplate }[],
  days: { weekday: Weekday; date: IsoDate }[],
  longDays: readonly Weekday[],
  avoidAdjacentHard: boolean,
  previousHardDates: readonly IsoDate[],
): Placement[] {
  const free = [...days];
  const placements: Placement[] = [];
  const hardDates: IsoDate[] = [...previousHardDates];

  const take = (predicate?: (d: { weekday: Weekday; date: IsoDate }) => boolean) => {
    const index = predicate ? free.findIndex(predicate) : 0;
    if (index < 0) return null;
    return free.splice(index, 1)[0] ?? null;
  };

  const byDuration = [...sized].sort((a, b) => b.seconds - a.seconds);

  // 1. The single longest session goes on a long day when one is free.
  const longest = byDuration.shift();
  if (longest) {
    const slot = take((d) => longDays.includes(d.weekday)) ?? take();
    if (slot) {
      placements.push({ ...longest, date: slot.date });
      if (longest.template.zone >= SAFETY_LIMITS.hardZoneThreshold) hardDates.push(slot.date);
    }
  }

  // 2. Hard sessions next, each on the free day furthest from every other hard day.
  const hard = byDuration.filter((s) => s.template.zone >= SAFETY_LIMITS.hardZoneThreshold);
  for (const item of hard) {
    if (free.length === 0) break;
    let bestIndex = 0;
    let bestDistance = -1;
    free.forEach((day, i) => {
      const distance = hardDates.length
        ? Math.min(...hardDates.map((d) => Math.abs(daysBetween(d, day.date))))
        : Number.POSITIVE_INFINITY;
      if (distance > bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    });
    if (avoidAdjacentHard && bestDistance <= 1 && hardDates.length > 0) {
      // No day is far enough away — drop this session rather than break the rail.
      continue;
    }
    const slot = free.splice(bestIndex, 1)[0];
    if (!slot) break;
    placements.push({ ...item, date: slot.date });
    hardDates.push(slot.date);
  }

  // 3. Everything else fills the remaining days in order.
  for (const item of byDuration) {
    if (item.template.zone >= SAFETY_LIMITS.hardZoneThreshold) continue;
    const slot = take();
    if (!slot) break;
    placements.push({ ...item, date: slot.date });
  }

  return placements.sort((a, b) => a.date.localeCompare(b.date));
}

/* ----------------------------------------------------------------- helpers */

function stepsSeconds(steps: readonly Step[]): number {
  return steps.reduce((total, step) => {
    const repeats = step.repeats ?? 1;
    return (
      total +
      step.durationSec * repeats +
      (step.recovery ? step.recovery.durationSec * Math.max(0, repeats - 1) : 0)
    );
  }, 0);
}

function maxZoneOf(steps: readonly Step[]): Zone {
  return steps.reduce<Zone>((max, step) => (step.zone > max ? step.zone : max), 1);
}

interface BuiltSession {
  readonly placement: Placement;
  readonly steps: Step[];
}

const buildOne = (placement: Placement, seconds: number): BuiltSession => ({
  placement: { ...placement, seconds },
  steps: placement.template.build(seconds),
});

const totalLoad = (built: readonly BuiltSession[]): number =>
  built.reduce((sum, b) => sum + plannedLoad(b.steps, b.placement.template.discipline), 0);

/**
 * Shrinks a week until it fits its load allowance.
 *
 * Scales every session proportionally first; when that hits the floor, drops
 * the lowest-priority session and tries again. Dropping a session is always
 * preferable to breaking a safety rail.
 */
function fitWeekToLoad(
  built: readonly BuiltSession[],
  allowedLoad: number,
  minSessions: number,
): BuiltSession[] {
  if (!Number.isFinite(allowedLoad) || built.length === 0) return [...built];

  let current = [...built];
  for (let attempt = 0; attempt < 12; attempt++) {
    const load = totalLoad(current);
    if (load <= allowedLoad) return current;

    // Relax the length floor as attempts go on. A very short session is odd,
    // but it beats a week that breaks a ramp cap.
    const floor = attempt < 4 ? ABSOLUTE_MIN_SESSION_SEC : attempt < 8 ? 10 * 60 : 5 * 60;

    const scale = allowedLoad / load;
    const scaled = current.map((b) =>
      // Floor, never round: rounding up would overshoot the very cap we are
      // trying to get under.
      buildOne(b.placement, Math.max(floor, Math.floor((b.placement.seconds * scale) / 60) * 60)),
    );

    const scaledLoad = totalLoad(scaled);
    if (scaledLoad <= allowedLoad) return scaled;
    if (scaledLoad < load - 0.01) {
      current = scaled;
      continue;
    }

    // Scaling has bottomed out — sessions are at their minimum length.
    // Take intensity out before taking sessions away: an easy session the
    // athlete completes beats a hard one that never gets scheduled.
    const downgradeIndex = scaled.findIndex(
      (b) => EASY_SUBSTITUTE[b.placement.template.id as TemplateId] !== undefined,
    );
    if (downgradeIndex >= 0) {
      const target = scaled[downgradeIndex]!;
      const substituteId = EASY_SUBSTITUTE[target.placement.template.id as TemplateId]!;
      const substitute = TEMPLATES[substituteId];
      current = scaled.map((b, i) =>
        i === downgradeIndex
          ? buildOne({ ...b.placement, template: substitute }, b.placement.seconds)
          : b,
      );
      continue;
    }

    if (scaled.length <= minSessions) return scaled;
    const dropIndex = scaled.reduce(
      (worst, b, i) =>
        b.placement.spec.priority > scaled[worst]!.placement.spec.priority ? i : worst,
      0,
    );
    current = scaled.filter((_, i) => i !== dropIndex);
  }
  return current;
}

/* --------------------------------------------------------------- generator */

/**
 * Constructs a plan without validating it.
 *
 * Exported for tests and diagnostics only — application code must call
 * `generatePlan`, which puts the result through the safety rails.
 *
 * @internal
 */
export function buildPlan(input: GenerateInput): Plan | FeasibilityFailure {
  const { profile, goal, today } = input;
  const startDate = startOfWeek(today);

  const raceDate = goal.mode === 'fitness' ? null : goal.raceDate;
  const totalWeeks =
    goal.mode === 'fitness'
      ? Math.max(1, goal.weeks)
      : Math.max(0, Math.ceil(daysBetween(startDate, goal.raceDate) / 7));

  if (goal.mode !== 'fitness' && totalWeeks < MIN_WEEKS[goal.distance]) {
    return refuse(goal.distance, totalWeeks, startDate);
  }

  const finishOnly = goal.mode === 'finish_only';
  const phases = blockPhases(totalWeeks, goal, profile.tier);

  const maxTrainingDays = 7 - restDaysRequired(profile.tier);
  const availableSessionSlots = Math.min(profile.availability.days.length, maxTrainingDays);
  const hardBudget = finishOnly ? 0 : hardSessionsAllowed(profile.tier);

  const dailySeconds = profile.availability.minutesPerDay * 60;
  const weeklyCeiling = profile.availability.days.length * dailySeconds * AVAILABILITY_UTILISATION;

  const weeks: PlanWeek[] = [];
  const sessions: Session[] = [];

  /** Load of the last week that actually contained training. */
  let previousLoad = 0;
  /** Load of the last training week that was neither recovery nor taper. */
  let lastNormalLoad = 0;
  /** Consecutive weeks with no training (blackouts), pending a detrain adjustment. */
  let offWeeks = 0;
  /** Loads of the weeks that actually contained training, in order. */
  const trainingLoads: number[] = [];
  let previousLongRunSec = 0;
  let previousHardDates: IsoDate[] = [];
  /**
   * The ramping baseline. Recovery and taper weeks dip below it without
   * pulling it down — otherwise every easy week would permanently ratchet the
   * whole plan smaller.
   */
  let rampSeconds = weeklyCeiling * 0.55;

  for (let index = 0; index < totalWeeks; index++) {
    const phase = phases[index] ?? 'base';
    const weekStart = addWeeks(startDate, index);
    const isRecovery =
      phase !== 'taper' &&
      index > 0 &&
      (index + 1) % RECOVERY_CYCLE === 0 &&
      index < totalWeeks - 1;

    /* -- volume for the week ------------------------------------------- */
    // Time off detrains. Coming back from a blackout, resume lower rather than
    // picking up where the ramp left off (docs/03 § Return-to-training ramp).
    if (offWeeks > 0) {
      rampSeconds = rampSeconds * Math.pow(DETRAIN_PER_OFF_WEEK, offWeeks);
      offWeeks = 0;
    } else if (index > 0 && phase !== 'taper' && !isRecovery) {
      rampSeconds = Math.min(rampSeconds * (1 + RAMP_RATE[profile.tier]), weeklyCeiling);
    }
    const targetSeconds =
      phase === 'taper' || isRecovery ? rampSeconds * RECOVERY_FACTOR : rampSeconds;

    /* -- session mix ---------------------------------------------------- */
    const weeksToRace = totalWeeks - index;
    const openWater =
      goal.mode !== 'fitness' &&
      phase !== 'prep' &&
      weeksToRace <= 7 &&
      weeksToRace >= 2 &&
      index % 3 === 0;
    // Spread the week's time over as many sessions as it can usefully support.
    // Four 15-minute sessions help nobody; three 20-minute ones do.
    const sessionCount = Math.min(
      availableSessionSlots,
      Math.max(MIN_SESSIONS_PER_WEEK, Math.floor(targetSeconds / ABSOLUTE_MIN_SESSION_SEC)),
    );
    const brick = (phase === 'build' || phase === 'peak') && !isRecovery && sessionCount >= 4;

    const specs = weekSpecs(phase, isRecovery, sessionCount, {
      openWater,
      brick,
      finishOnly,
      hardBudget,
    });

    const totalWeight = specs.reduce((sum, s) => sum + s.weight, 0);
    const sized = specs.map((spec) => {
      const template = TEMPLATES[spec.templateId];
      const share = (targetSeconds * spec.weight) / totalWeight;
      const capped = Math.min(share, dailySeconds);
      const seconds = Math.max(template.minSeconds, Math.round(capped / 60) * 60);
      return { spec, template, seconds: Math.min(seconds, dailySeconds) };
    });

    /* -- long-run ramp cap --------------------------------------------- */
    if (previousLongRunSec > 0 && !isRecovery) {
      const cap = previousLongRunSec * (1 + SAFETY_LIMITS.longRunRampCap * LONG_RUN_MARGIN);
      // Floor, not round, and ignore the template minimum: a short run is fine,
      // a run that grows too fast is how beginners get injured.
      const capped = Math.max(ABSOLUTE_MIN_SESSION_SEC, Math.floor(cap / 60) * 60);
      for (const item of sized) {
        if (item.template.discipline === 'run' && item.seconds > capped) {
          item.seconds = capped;
        }
      }
    }

    /* -- placement ------------------------------------------------------ */
    const days = candidateDays(weekStart, profile, raceDate);
    const placements = placeSessions(
      sized,
      days,
      profile.availability.longDays,
      profile.tier === 'first_timer',
      previousHardDates,
    );

    /* -- materialise ---------------------------------------------------- */
    const raw = placements.map((placement) => buildOne(placement, placement.seconds));

    /* -- load allowance from the safety rails --------------------------- */
    let allowedLoad = Number.POSITIVE_INFINITY;

    // Rolling block cap, measured over TRAINING weeks only — the same basis the
    // rail uses. Counting blackout weeks as zeros would squeeze every week
    // after a holiday down to nothing. This applies to every week, recovery and
    // taper included, since the rail does not exempt them either.
    if (trainingLoads.length >= 7) {
      const earlier = trainingLoads.slice(-7, -3).reduce((sum, l) => sum + l, 0);
      const recentSoFar = trainingLoads.slice(-3).reduce((sum, l) => sum + l, 0);
      if (earlier > 0) {
        const blockCap =
          earlier * (1 + SAFETY_LIMITS.rollingFourWeekCap * ROLLING_MARGIN) - recentSoFar;
        allowedLoad = Math.max(0, blockCap);
      }
    }

    if ((isRecovery || phase === 'taper') && previousLoad > 0) {
      allowedLoad = Math.min(allowedLoad, previousLoad * RECOVERY_FACTOR);
    } else if (index > 0) {
      // Coming out of a recovery week, ramp from the last normal week rather
      // than the deliberately-light one — otherwise the plan overshoots.
      const previousWeek = weeks[index - 1];
      const reference = previousWeek && !previousWeek.isRecovery ? previousLoad : lastNormalLoad;
      if (reference > 0) {
        allowedLoad = Math.min(
          allowedLoad,
          reference * (1 + SAFETY_LIMITS.weeklyRampCap * RAMP_MARGIN),
        );
      }
    }

    const built = fitWeekToLoad(
      raw,
      allowedLoad,
      isRecovery ? MIN_SESSIONS_RECOVERY_WEEK : MIN_SESSIONS_PER_WEEK,
    );

    /* -- emit ----------------------------------------------------------- */
    let weekLoad = 0;
    let weekSeconds = 0;
    let longestRun = 0;
    const hardDatesThisWeek: IsoDate[] = [];

    for (const { placement, steps } of built) {
      const discipline = placement.template.discipline;
      const load = plannedLoad(steps, discipline);
      const seconds = stepsSeconds(steps);
      const zone = maxZoneOf(steps);

      weekLoad += load;
      weekSeconds += seconds;
      if (discipline === 'run' && seconds > longestRun) longestRun = seconds;
      if (zone >= SAFETY_LIMITS.hardZoneThreshold) hardDatesThisWeek.push(placement.date);

      sessions.push({
        id: `${String(placement.date)}-${placement.template.id}`,
        date: placement.date,
        weekIndex: index,
        discipline,
        templateId: placement.template.id,
        title: placement.template.title,
        purpose: placement.template.purpose,
        plannedSeconds: seconds,
        plannedLoad: Math.round(load * 10) / 10,
        zone,
        steps,
        tags: placement.template.tags,
        status: 'planned',
      });
    }

    weeks.push({
      index,
      startDate: weekStart,
      phase,
      isRecovery,
      targetLoad: Math.round(weekLoad * 10) / 10,
      targetSeconds: weekSeconds,
      focus: isRecovery ? RECOVERY_FOCUS : PHASE_FOCUS[phase],
    });

    if (weekLoad > 0) {
      trainingLoads.push(weekLoad);
      previousLoad = weekLoad;
      if (!isRecovery && phase !== 'taper') lastNormalLoad = weekLoad;
      if (longestRun > 0 && !isRecovery) previousLongRunSec = longestRun;
    } else {
      offWeeks += 1;
    }
    previousHardDates = hardDatesThisWeek;
  }

  return {
    startDate,
    endDate: raceDate ?? addWeeks(startDate, totalWeeks),
    goal,
    totalWeeks,
    weeks,
    sessions,
    generatorVersion: GENERATOR_VERSION,
  };
}

/**
 * Builds a plan and puts it through the safety rails.
 *
 * A plan that breaks a rail throws rather than shipping — that is a generator
 * bug, and an error page is better than an unsafe plan.
 */
export function generatePlan(input: GenerateInput): GenerateResult {
  const built = buildPlan(input);
  if ('ok' in built) return built;
  return { ok: true, plan: assertPlanIsSafe(built, input.profile) };
}
