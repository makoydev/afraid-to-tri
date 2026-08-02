import { ZONE_BANDS } from './zones';
import type { Discipline, SessionTag, Step, Zone } from './types';

/**
 * The workout library.
 *
 * Templates are parameterised by duration. Every `build` returns steps that sum
 * *exactly* to the requested total — the safety validator checks this, because
 * a session that claims 45 minutes and prescribes 38 is a lie to the athlete.
 */

export interface WorkoutTemplate {
  readonly id: string;
  readonly discipline: Discipline;
  readonly title: string;
  /** Plain English, always present, never jargon-first. */
  readonly purpose: string;
  readonly zone: Zone;
  readonly tags: readonly SessionTag[];
  readonly minSeconds: number;
  readonly build: (totalSec: number) => Step[];
}

const cueFor = (zone: Zone): string => ZONE_BANDS[zone].cue;

/**
 * Warm-up and cool-down, rounded to whole minutes, with sane floors.
 *
 * The bookends never take more than 60% of the session, so the main set always
 * survives — a five-minute session is unusual, but it must still be coherent.
 */
function bookends(total: number): { warmUp: number; coolDown: number } {
  const budget = Math.floor(total * 0.6);
  const preferredWarm = Math.max(300, Math.round((total * 0.15) / 60) * 60);
  const preferredCool = Math.max(240, Math.round((total * 0.1) / 60) * 60);

  if (preferredWarm + preferredCool <= budget) {
    return { warmUp: preferredWarm, coolDown: preferredCool };
  }

  const warmUp = Math.max(30, Math.floor(budget / 2 / 30) * 30);
  const coolDown = Math.max(30, budget - warmUp);
  return { warmUp, coolDown };
}

/**
 * `reps` efforts have only `reps - 1` recoveries between them. Sizing the rest
 * from what is actually left is what keeps the steps summing to the total.
 *
 * Work is clamped so the block can never overrun the main set, which would
 * otherwise show up as a negative cool-down.
 */
function intervalBlock(
  main: number,
  requestedReps: number,
  workShare: number,
  grain: number,
): { reps: number; work: number; rest: number; used: number } {
  // Each rep needs at least one grain of work, and each gap one of recovery.
  let reps = requestedReps;
  while (reps > 1 && main < (2 * reps - 1) * grain) reps -= 1;

  const gaps = reps - 1;
  const maxWorkTotal = main - gaps * grain;
  const ideal = Math.round((main * workShare) / reps / grain) * grain;
  const work = Math.max(grain, Math.min(ideal, Math.floor(maxWorkTotal / reps / grain) * grain));

  const remaining = main - reps * work;
  const rest = gaps === 0 ? 0 : Math.max(grain, Math.floor(remaining / gaps / grain) * grain);

  return { reps, work, rest, used: reps * work + gaps * rest };
}

/** Builds a warm-up / main / cool-down session whose steps sum exactly. */
function steady(total: number, mainZone: Zone, mainCue: string): Step[] {
  const { warmUp, coolDown } = bookends(total);
  const main = total - warmUp - coolDown;
  return [
    { label: 'Warm-up', durationSec: warmUp, zone: 1, cue: 'Ease into it' },
    { label: 'Main set', durationSec: main, zone: mainZone, cue: mainCue },
    { label: 'Cool-down', durationSec: coolDown, zone: 1, cue: 'Easy — let the heart rate come down' },
  ];
}

/** Builds an interval session, absorbing any rounding remainder into the cool-down. */
function intervals(
  total: number,
  opts: {
    reps: number;
    workShare: number;
    grain: number;
    workZone: Zone;
    workCue: string;
    restCue: string;
    warmUpZone?: Zone;
  },
): Step[] {
  const { warmUp, coolDown } = bookends(total);
  const main = total - warmUp - coolDown;
  const block = intervalBlock(main, opts.reps, opts.workShare, opts.grain);
  const remainder = main - block.used;
  return [
    { label: 'Warm-up', durationSec: warmUp, zone: opts.warmUpZone ?? 2, cue: 'Build gradually' },
    {
      label: 'Main set',
      durationSec: block.work,
      zone: opts.workZone,
      cue: opts.workCue,
      repeats: block.reps,
      // A single effort has nothing to recover between.
      ...(block.reps > 1
        ? { recovery: { durationSec: block.rest, zone: 1 as const, cue: opts.restCue } }
        : {}),
    },
    {
      label: 'Cool-down',
      durationSec: coolDown + remainder,
      zone: 1,
      cue: 'Easy — let the heart rate come down',
    },
  ];
}

export const TEMPLATES = {
  'swim.technique': {
    id: 'swim.technique',
    discipline: 'swim',
    title: 'Technique swim',
    purpose:
      'Frequency beats distance in the water. This one is about feeling smooth, not working hard.',
    zone: 2,
    tags: ['skills'],
    minSeconds: 20 * 60,
    build(total) {
      const { warmUp, coolDown } = bookends(total);
      const main = total - warmUp - coolDown;
      const drills = Math.round(main * 0.45);
      return [
        { label: 'Warm-up', durationSec: warmUp, zone: 1, cue: 'Easy, mix in some backstroke' },
        {
          label: 'Drills',
          durationSec: drills,
          zone: 2,
          cue: '6 × 50 m — one length drill, one length swim',
        },
        {
          label: 'Main set',
          durationSec: main - drills,
          zone: 2,
          cue: '8 × 50 m steady, 20 seconds rest',
        },
        { label: 'Cool-down', durationSec: coolDown, zone: 1, cue: 'Easy, long strokes' },
      ];
    },
  },

  'swim.endurance': {
    id: 'swim.endurance',
    discipline: 'swim',
    title: 'Endurance swim',
    purpose:
      'Builds the ability to keep going. Pace matters far less here than simply not stopping.',
    zone: 2,
    tags: [],
    minSeconds: 20 * 60,
    build: (total) => steady(total, 2, '4 × 200 m steady, 30 seconds rest'),
  },

  'swim.threshold': {
    id: 'swim.threshold',
    discipline: 'swim',
    title: 'Threshold swim',
    purpose: 'Repeats at your best sustainable pace. This is what makes race pace feel easier.',
    zone: 4,
    tags: [],
    minSeconds: 25 * 60,
    build: (total) =>
      intervals(total, {
        reps: 6,
        workShare: 0.75,
        grain: 10,
        workZone: 4,
        workCue: '100 m hard and even',
        restCue: 'Rest at the wall',
      }),
  },

  'swim.openwater': {
    id: 'swim.openwater',
    discipline: 'swim',
    title: 'Open water swim',
    purpose:
      'Practising in the real thing: sighting, swimming straight, and getting used to how different open water feels.',
    zone: 2,
    tags: ['openwater', 'skills'],
    minSeconds: 25 * 60,
    build(total) {
      const acclimatise = Math.max(30, Math.min(180, Math.floor((total * 0.2) / 30) * 30));
      const rest = total - acclimatise;
      const { warmUp, coolDown } = bookends(rest);
      return [
        {
          label: 'Get in slowly',
          durationSec: acclimatise,
          zone: 1,
          cue: 'Face in, breathe out. Wait for the gasp reflex to pass — it always does.',
        },
        { label: 'Warm-up', durationSec: warmUp, zone: 1, cue: 'Easy, stay close to shore' },
        {
          label: 'Main set',
          durationSec: rest - warmUp - coolDown,
          zone: 2,
          cue: 'Steady swimming, look forward every six strokes',
        },
        { label: 'Cool-down', durationSec: coolDown, zone: 1, cue: 'Easy back to shore' },
      ];
    },
  },

  'bike.endurance': {
    id: 'bike.endurance',
    discipline: 'bike',
    title: 'Easy ride',
    purpose:
      'Builds the aerobic base everything else sits on. You should be able to hold a conversation the whole way.',
    zone: 2,
    tags: [],
    minSeconds: 25 * 60,
    build: (total) => steady(total, 2, cueFor(2)),
  },

  'bike.long': {
    id: 'bike.long',
    discipline: 'bike',
    title: 'Long ride',
    purpose:
      "This week's longest session. It builds durability, and it is where you practise eating and drinking on the bike.",
    zone: 2,
    tags: ['key'],
    minSeconds: 30 * 60,
    build: (total) =>
      steady(total, 2, 'Steady. Drink every 15 minutes, eat something every 45.'),
  },

  'bike.tempo': {
    id: 'bike.tempo',
    discipline: 'bike',
    title: 'Tempo ride',
    purpose: 'Comfortably hard blocks. This is close to how the bike leg will actually feel.',
    zone: 3,
    tags: [],
    minSeconds: 30 * 60,
    build: (total) =>
      intervals(total, {
        reps: 3,
        workShare: 0.72,
        grain: 60,
        workZone: 3,
        workCue: 'Steady and controlled',
        restCue: 'Easy spin',
      }),
  },

  'bike.threshold': {
    id: 'bike.threshold',
    discipline: 'bike',
    title: 'Threshold intervals',
    purpose:
      'The hardest effort you can hold for a while. Uncomfortable by design — it is what raises your ceiling.',
    zone: 4,
    tags: ['key'],
    minSeconds: 35 * 60,
    build: (total) =>
      intervals(total, {
        reps: 4,
        workShare: 0.62,
        grain: 60,
        workZone: 4,
        workCue: 'Hard but even — no heroics on the first one',
        restCue: 'Easy spin, let the legs come back',
      }),
  },

  'run.easy': {
    id: 'run.easy',
    discipline: 'run',
    title: 'Easy run',
    purpose:
      'Most of your running should feel this easy. If you are breathing hard, slow down — that is not cheating.',
    zone: 2,
    tags: [],
    minSeconds: 20 * 60,
    build: (total) => steady(total, 2, cueFor(2)),
  },

  'run.long': {
    id: 'run.long',
    discipline: 'run',
    title: 'Long run',
    purpose:
      'Builds endurance and the mental side of keeping going. Walk breaks are completely allowed.',
    zone: 2,
    tags: ['key'],
    minSeconds: 25 * 60,
    build: (total) => steady(total, 2, 'Steady and easy the whole way. Start slower than feels right.'),
  },

  'run.intervals': {
    id: 'run.intervals',
    discipline: 'run',
    title: 'Run intervals',
    purpose:
      'Short, fast repeats with full recovery. Small doses, big effect on your top-end speed.',
    zone: 5,
    tags: [],
    minSeconds: 25 * 60,
    build: (total) =>
      intervals(total, {
        reps: 6,
        workShare: 0.45,
        grain: 10,
        workZone: 5,
        workCue: 'Fast but controlled — same speed on the last one as the first',
        restCue: 'Walk or very easy jog',
      }),
  },

  'brick.bikerun': {
    id: 'brick.bikerun',
    discipline: 'brick',
    title: 'Brick: bike then run',
    purpose:
      'The signature triathlon session. Your legs will feel like jelly for the first five minutes off the bike — that is normal, and it stops being alarming once you have felt it in training.',
    zone: 3,
    tags: ['brick', 'key'],
    minSeconds: 40 * 60,
    build(total) {
      // Every portion scales with the session, so a shortened brick is still a
      // brick: some riding, a transition, and a run off the bike.
      const transition = Math.max(30, Math.min(120, Math.floor((total * 0.08) / 30) * 30));
      const usable = total - transition;
      const idealBike = Math.round((usable * 0.66) / 60) * 60;
      const bike = Math.max(120, Math.min(idealBike, usable - 120));
      const run = usable - bike;
      const bikeWarm = Math.max(60, Math.min(600, Math.min(Math.floor((bike * 0.35) / 60) * 60, bike - 60)));
      return [
        { label: 'Bike warm-up', durationSec: bikeWarm, zone: 1, cue: 'Spin easy' },
        { label: 'Bike main', durationSec: bike - bikeWarm, zone: 3, cue: 'Steady race effort' },
        {
          label: 'Transition',
          durationSec: transition,
          zone: 1,
          cue: 'Rack the bike, change shoes, go. Practise being quick.',
        },
        {
          label: 'Run off the bike',
          durationSec: run,
          zone: 3,
          cue: 'Short steps, quick turnover. It gets better after five minutes.',
        },
      ];
    },
  },

  'strength.core': {
    id: 'strength.core',
    discipline: 'strength',
    title: 'Core and mobility',
    purpose:
      'Twenty minutes at home that keeps your hips and back happy when the run volume goes up.',
    zone: 2,
    tags: [],
    minSeconds: 15 * 60,
    build(total) {
      const mobility = Math.round(total * 0.3);
      return [
        { label: 'Mobility', durationSec: mobility, zone: 1, cue: 'Hips, ankles, upper back' },
        {
          label: 'Core circuit',
          durationSec: total - mobility,
          zone: 2,
          cue: 'Plank, side plank, glute bridge, dead bug — three rounds',
        },
      ];
    },
  },
} as const satisfies Record<string, WorkoutTemplate>;

export type TemplateId = keyof typeof TEMPLATES;

export function templateById(id: TemplateId): WorkoutTemplate {
  return TEMPLATES[id];
}
