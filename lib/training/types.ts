/**
 * The vocabulary of the training domain.
 *
 * These types are the contract between the pure core and everything else.
 * No behaviour lives here — see docs/03-training-model.md for the model itself.
 */

/** A calendar day in the athlete's local timezone, `YYYY-MM-DD`. */
export type IsoDate = string & { readonly __brand: 'IsoDate' };

export type Seconds = number;
export type Meters = number;

export type Discipline = 'swim' | 'bike' | 'run' | 'brick' | 'strength' | 'mobility';

/** 1 = recovery … 5 = very hard. See docs/03 § Intensity. */
export type Zone = 1 | 2 | 3 | 4 | 5;

/** Rate of perceived exertion, 1–10. */
export type Rpe = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type ExperienceTier = 'first_timer' | 'improver' | 'experienced';

export type RaceDistance = 'super_sprint' | 'sprint' | 'olympic' | 'half' | 'full';

export type PlanPhase = 'prep' | 'base' | 'build' | 'peak' | 'taper';

export type SessionStatus = 'planned' | 'completed' | 'partial' | 'skipped' | 'missed';

export type SkipReason = 'ill' | 'injured' | 'travel' | 'life' | 'tired' | 'weather' | 'other';

export type BodyCheck = 'fine' | 'niggle' | 'pain';

/** 0 = Monday … 6 = Sunday. ISO-8601 weekday ordering. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface DateRange {
  readonly from: IsoDate;
  readonly to: IsoDate;
}

/* ---------------------------------------------------------------- athlete -- */

export interface SwimCapability {
  readonly continuousMeters: Meters;
  readonly cssPacePer100m?: Seconds;
  readonly track: 'learn' | 'develop' | 'refine';
}

export interface BikeCapability {
  readonly continuousSeconds: Seconds;
  readonly ftpWatts?: number;
  readonly lthr?: number;
}

export interface RunCapability {
  readonly continuousSeconds: Seconds;
  readonly thresholdPacePerKm?: Seconds;
  readonly lthr?: number;
}

export interface Availability {
  readonly days: readonly Weekday[];
  /** Minutes available on each chosen day. */
  readonly minutesPerDay: number;
  readonly longDays: readonly Weekday[];
}

export interface AthleteProfile {
  readonly tier: ExperienceTier;
  readonly swim: SwimCapability;
  readonly bike: BikeCapability;
  readonly run: RunCapability;
  readonly maxHr?: number;
  readonly restingHr?: number;
  readonly ageYears?: number;
  readonly availability: Availability;
  readonly confidence: Readonly<Record<'swim' | 'bike' | 'run', 1 | 2 | 3>>;
  readonly blackoutDates: readonly DateRange[];
}

/* ------------------------------------------------------------------- goal -- */

export interface RaceGoal {
  readonly mode: 'race' | 'finish_only';
  readonly distance: RaceDistance;
  readonly raceDate: IsoDate;
  readonly raceName: string;
}

export interface FitnessGoal {
  readonly mode: 'fitness';
  /** Rolling block length when there is no race to work back from. */
  readonly weeks: number;
}

export type Goal = RaceGoal | FitnessGoal;

/* ---------------------------------------------------------------- session -- */

export interface StepRecovery {
  readonly durationSec: Seconds;
  readonly zone: Zone;
  readonly cue: string;
}

export interface Step {
  readonly label: string;
  readonly durationSec: Seconds;
  readonly zone: Zone;
  readonly cue: string;
  readonly repeats?: number;
  readonly recovery?: StepRecovery;
}

export type SessionTag = 'brick' | 'openwater' | 'test' | 'skills' | 'race_sim' | 'key';

export interface Session {
  readonly id: string;
  readonly date: IsoDate;
  readonly weekIndex: number;
  readonly discipline: Discipline;
  readonly templateId: string;
  readonly title: string;
  /** Required, plain English, always present. See docs/01 § F-06. */
  readonly purpose: string;
  readonly plannedSeconds: Seconds;
  readonly plannedLoad: number;
  readonly zone: Zone;
  readonly steps: readonly Step[];
  readonly tags: readonly SessionTag[];
  readonly status: SessionStatus;
  readonly actualSeconds?: Seconds;
  readonly rpe?: Rpe;
  readonly bodyCheck?: BodyCheck;
  readonly skipReason?: SkipReason;
}

/* ------------------------------------------------------------------- plan -- */

export interface PlanWeek {
  readonly index: number;
  readonly startDate: IsoDate;
  readonly phase: PlanPhase;
  readonly isRecovery: boolean;
  readonly targetLoad: number;
  readonly targetSeconds: Seconds;
  readonly focus: string;
}

export interface Plan {
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly goal: Goal;
  readonly totalWeeks: number;
  readonly weeks: readonly PlanWeek[];
  readonly sessions: readonly Session[];
  readonly generatorVersion: string;
}

/* ------------------------------------------------------------ feasibility -- */

export type FeasibilityOption =
  | { readonly type: 'shorter_distance'; readonly distance: RaceDistance; readonly label: string }
  | { readonly type: 'later_date'; readonly suggestedDate: IsoDate; readonly label: string }
  | { readonly type: 'finish_only'; readonly label: string };

export interface FeasibilityFailure {
  readonly ok: false;
  readonly reason: 'runway_too_short' | 'cannot_swim_far_enough';
  readonly minimumWeeks: number;
  readonly availableWeeks: number;
  readonly message: string;
  readonly options: readonly FeasibilityOption[];
}

export type GenerateResult = { readonly ok: true; readonly plan: Plan } | FeasibilityFailure;

/* ---------------------------------------------------------------- metrics -- */

export interface DailyMetric {
  readonly date: IsoDate;
  readonly load: number;
  readonly fitness: number;
  readonly fatigue: number;
  readonly freshness: number;
}

/* ------------------------------------------------------------- adaptation -- */

export type AdjustmentType =
  | 'reduce_intensity'
  | 'reduce_volume'
  | 'increase_ramp'
  | 'reschedule'
  | 'drop_session'
  | 'insert_recovery'
  | 'replan'
  | 'return_to_training';

export interface PlanAdjustment {
  readonly ruleId: string;
  readonly type: AdjustmentType;
  /** Shown verbatim to the athlete. Never contains the word "failed". */
  readonly reason: string;
  readonly magnitude: number;
  readonly affectedSessionIds: readonly string[];
}
