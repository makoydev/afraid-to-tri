# 03 — Training Model

This is the domain core: how the app measures effort, builds a plan, and changes it when reality intervenes. Everything here is deterministic and testable — it belongs in `lib/training/` as pure functions with no I/O.

> **Terminology note.** "TSS", "NP" and "IF" are TrainingPeaks trademarks, and CTL/ATL/TSB are their branded names for the impulse–response model. We use generic names throughout — **Load**, **Intensity Ratio**, **Fitness / Fatigue / Freshness** — computed from the same publicly-documented, decades-old sports-science concepts (Banister's impulse–response model, Foster's session-RPE, Friel's zone system).

---

## Athlete model

```ts
type Discipline = 'swim' | 'bike' | 'run' | 'strength' | 'brick' | 'rest';

interface AthleteProfile {
  // capability, from onboarding or measured
  swim: { continuousMeters: number; cssPacePer100m?: Seconds; track: 'learn' | 'develop' | 'refine' };
  bike: { continuousMinutes: number; ftpWatts?: number; lthrBike?: number };
  run:  { continuousMinutes: number; thresholdPacePerKm?: Seconds; lthrRun?: number };

  maxHr?: number;
  restingHr?: number;

  // context
  availability: { days: Weekday[]; minutesPerDay: Record<Weekday, number>; longDays: Weekday[] };
  confidence: Record<'swim' | 'bike' | 'run', 1 | 2 | 3>;
  ageYears?: number;
  trainingAgeMonths: number;          // months of consistent endurance training
  constraints: { injuries: string[]; blackoutDates: DateRange[] };
  equipment: { poolAccess: boolean; trainer: boolean; hrStrap: boolean; powerMeter: boolean; bikeType: BikeType };

  // derived
  experienceTier: 'first-timer' | 'improver' | 'experienced';
}
```

`experienceTier` gates almost every default in this document (ramp rate, hard-session count, whether zones are shown at all).

---

## Intensity: zones

Beginners train by **feel**. Zones unlock when the athlete completes a test ([F-22](01-product-spec.md#f-22--fitness-tests--zones--p1)). Both altitudes describe the same five bands.

### The five bands

| Band | Name | Feels like | Talk test | RPE | Purpose |
|---|---|---|---|---|---|
| 1 | Recovery | Very easy, almost too easy | Full conversation, singing | 1–2 | Blood flow, active recovery |
| 2 | Easy | Comfortable, sustainable all day | Full sentences comfortably | 3–4 | Aerobic base — the bulk of training |
| 3 | Steady | Working but controlled | Short sentences | 5–6 | Race pace for long-course, tempo |
| 4 | Hard | Uncomfortable, sustainable ~1 h | A few words only | 7–8 | Threshold — raises the ceiling |
| 5 | Very hard | Can't hold long | One word, or nothing | 9–10 | VO₂max, speed, race finishes |

The app's default copy is the **Feels like / Talk test** column. Numeric targets are additive, never a replacement.

### Numeric zone derivation

Once a test exists, derive per-discipline targets. Sources in priority order — always use the most direct signal available:

```
bike:  power (FTP)      →  HR (bike LTHR)  →  RPE
run:   pace (threshold) →  HR (run LTHR)   →  RPE
swim:  pace (CSS)       →  RPE
```

**Heart-rate zones as % of discipline LTHR** (Friel's system; run and bike LTHR differ, typically by 5–10 bpm, and must be tested separately):

| Band | Run (% LTHR) | Bike (% LTHR) |
|---|---|---|
| 1 | < 85% | < 81% |
| 2 | 85–89% | 81–89% |
| 3 | 90–94% | 90–93% |
| 4 | 95–99% | 94–99% |
| 5 | ≥ 100% | ≥ 100% |

**Power zones as % of FTP:** Z1 < 55 · Z2 55–75 · Z3 76–90 · Z4 91–105 · Z5 > 105.

**Run pace zones as % of threshold pace** (slower = higher %): Z1 > 129 · Z2 114–129 · Z3 106–113 · Z4 100–105 · Z5 < 100.

**Swim zones from CSS pace per 100 m:** Z1 CSS + 10 s · Z2 CSS + 6–8 s · Z3 CSS + 3–5 s · Z4 CSS ± 2 s · Z5 faster than CSS − 3 s.

### Test protocols (F-22)

| Test | Protocol | Derivation |
|---|---|---|
| Run threshold | 30 min all-out time trial, solo, flat | Threshold pace ≈ average pace of the 30 min. Run LTHR ≈ average HR of the **final 20 min**. |
| Bike FTP | 20 min all-out after a structured warm-up | FTP ≈ 0.95 × 20-min average power. Bike LTHR ≈ average HR of final 20 min. |
| Swim CSS | 400 m TT, rest fully, then 200 m TT | CSS speed = (400 − 200) m ÷ (t400 − t200) s. CSS pace per 100 m = (t400 − t200) ÷ 2. |

Retest every 6–8 weeks, or whenever an adaptation trigger suggests fitness has moved. Tests are **never** scheduled in the first two weeks of a first-timer's plan — they're demoralizing before there's any base.

**Fallback when nothing is measured:** if HR max is unknown, estimate with `211 − 0.64 × age` (Nes et al.) — more accurate than `220 − age`, but still ±10 bpm at one SD. Any zone derived this way is labelled **estimated** in the UI, and RPE remains the primary cue.

---

## Load model

### Session Load

One number per session, in **Load Units (LU)**, calibrated so that **one hour at threshold = 100 LU**.

```
Load = durationHours × IR² × 100
```

`IR` (Intensity Ratio) is effort relative to threshold, from the best available source:

| Source | IR |
|---|---|
| Power | `weightedAvgPower / FTP` |
| Run pace | `thresholdPacePerKm / actualPacePerKm` |
| Swim pace | `cssPacePer100m / actualPacePer100m` |
| Heart rate | `avgSessionHr / LTHR`, clamped to [0.5, 1.1] |
| RPE only | lookup table below |

**RPE → IR** (the fallback path, and the *only* path for most first-timers):

| RPE | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| IR | 0.45 | 0.55 | 0.63 | 0.70 | 0.77 | 0.84 | 0.90 | 0.96 | 1.02 | 1.08 |

This is a smooth mapping of Foster's session-RPE method onto the same quadratic scale, so a beginner logging by feel and an athlete with a power meter produce comparable numbers. The squaring matters: it's what makes intensity cost disproportionately more than duration, which is the whole point of the metric.

**Weighted average power** (for variable rides) uses the standard 30-second rolling-average, fourth-power, mean, fourth-root method. For steady sessions it collapses to plain average.

**Discipline weighting.** Raw LU under-counts running's mechanical cost and over-counts swimming's systemic cost. Apply a multiplier when aggregating across disciplines:

| Discipline | Multiplier | Rationale |
|---|---|---|
| Run | 1.15 | Eccentric loading, higher injury risk per LU |
| Bike | 1.00 | Baseline |
| Swim | 0.85 | Non-weight-bearing, lower systemic residue |
| Strength | 0.70 | Counted, but not equivalent |

### Fitness, Fatigue, Freshness

Exponentially-weighted moving averages of daily load (Banister impulse–response):

```ts
const FITNESS_TC = 42;  // days
const FATIGUE_TC = 7;   // days

fitness[d] = fitness[d-1] + (load[d] - fitness[d-1]) / FITNESS_TC;
fatigue[d] = fatigue[d-1] + (load[d] - fatigue[d-1]) / FATIGUE_TC;
freshness[d] = fitness[d-1] - fatigue[d-1];   // yesterday's values, by convention
```

Interpretation surfaced to the user — **always in words, never bare numbers**:

| Freshness | Label | Copy |
|---|---|---|
| > +15 | Very fresh | "Well rested — possibly detrained if this lasts" |
| +5 to +15 | Fresh | "Race-ready" |
| −10 to +5 | Neutral | "Normal training balance" |
| −25 to −10 | Loaded | "Building hard. This is where fitness comes from." |
| < −25 | Overloaded | "Dig-deep territory. Watch for warning signs." |

Seeded on connect from imported history ([F-11](01-product-spec.md#f-11--activity-import--strava--p0-user-prioritized)); otherwise starts at zero and the chart stays hidden until 21 days of data exist.

---

## Plan generation

### Inputs → output

```ts
function generatePlan(profile: AthleteProfile, goal: Goal, today: Date): Plan
```

A `Plan` is a list of `Week`s; each `Week` has a phase, a target load, and a list of `Session`s placed on dates.

### Step 1 — Runway and feasibility

```
weeks = floor(daysBetween(today, goal.raceDate) / 7)
```

Minimum viable runway, given the athlete's starting point:

| Race | Absolute minimum | Comfortable | Beginner-recommended |
|---|---|---|---|
| Super sprint | 4 wk | 8 wk | 10 wk |
| Sprint | 6 wk | 12 wk | 14 wk |
| Olympic | 10 wk | 16 wk | 20 wk |
| 70.3 | 16 wk | 20 wk | 24 wk |
| Full | 24 wk | 30 wk | 36 wk |

Below the absolute minimum, or when the athlete can't yet swim a quarter of the race distance, the generator **refuses to pretend**. It returns a `FeasibilityWarning` with three concrete options: shorter distance · later race · finish-don't-race mode (intensity capped, volume prioritized, goal explicitly reframed as completion).

### Step 2 — Phase blocking

Work backwards from race day.

| Phase | Share of runway | Purpose | Character |
|---|---|---|---|
| **Prep** | 0–3 wk (only if `trainingAge < 3 months` or a discipline is at zero) | Get moving, build habit, learn technique | All Z1–Z2, short, frequent, skills-heavy |
| **Base** | ~45% | Aerobic engine, durability | 85% Z1–Z2, volume grows, technique focus |
| **Build** | ~30% | Race-specific fitness | Z3–Z4 introduced, bricks start, volume plateaus |
| **Peak** | ~10% | Sharpen | Race-pace work, volume starts easing |
| **Taper** | fixed, see below | Shed fatigue, keep fitness | Volume down hard, intensity retained |

**Taper length by distance:** super sprint 4–5 d · sprint 5–7 d · Olympic 7–10 d · 70.3 10–14 d · full 14–21 d.

If runway is short, phases are compressed in this order: Prep → Peak → Build → Base. Taper is **never** compressed below the minimum — it's the phase beginners most want to skip and the one that most reliably improves their day.

### Step 3 — Weekly load progression

```ts
// starting weekly load, from current fitness or estimated from onboarding answers
let weekLoad = seedWeeklyLoad(profile);

for (const week of weeks) {
  if (week.isRecovery) {
    week.targetLoad = previousBuildLoad * RECOVERY_FACTOR;   // 0.55–0.70
  } else {
    week.targetLoad = min(
      previousLoad * (1 + rampRate(profile)),
      availabilityCeiling(profile),      // hours the athlete actually has
      phaseCeiling(week.phase)
    );
  }
}
```

**Ramp rate by tier:** first-timer 4–6% · improver 6–8% · experienced 8–10%. Hard cap: **never more than 10% week-over-week**, and never more than 30% over any rolling 4 weeks.

**Build:recovery cycling:** 3:1 by default; 2:1 for athletes over 45, first-timers, or anyone training under 4 h/week. A recovery week is 55–70% of the preceding build week and is **never** skipped by adaptation.

`availabilityCeiling` plans to **90%** of stated availability. Users overestimate their free time, and slack is what absorbs a bad week.

### Step 4 — Discipline allocation

Base split by race distance (share of weekly *time*, not load):

| Race | Swim | Bike | Run | Strength/other |
|---|---|---|---|---|
| Super sprint / Sprint | 25% | 40% | 30% | 5% |
| Olympic | 22% | 43% | 30% | 5% |
| 70.3 | 18% | 50% | 27% | 5% |
| Full | 15% | 55% | 25% | 5% |

Then adjust:
- **Weakness bias:** the lowest-confidence or lowest-capability discipline gets +5 to +10 percentage points, taken proportionally from the others.
- **Frequency floor:** swimming is a technique sport — a minimum of **2 swims/week** (3 preferred) regardless of allocation, even if each is short. Frequency beats duration in the water.
- **Run cap:** for first-timers, running volume increases by at most 10%/week and long-run duration by at most 10%/week. Running is where beginners get hurt.
- **Learn-to-swim track:** if `swim.track === 'learn'`, early swim sessions are replaced with skills sessions (breathing, floating, 25 m repeats), and swim load is deliberately under-counted so it doesn't crowd out bike/run.

### Step 5 — Intensity distribution

Polarized/pyramidal, by phase:

| Phase | Z1–Z2 | Z3 | Z4–Z5 |
|---|---|---|---|
| Prep | 100% | — | — |
| Base | 85% | 10% | 5% |
| Build | 75% | 15% | 10% |
| Peak | 75% | 10% | 15% |
| Taper | 80% | 5% | 15% |

Hard-session cap per week: first-timer **2**, improver **3**, experienced **4** (counting Z4+ sessions and long bricks).

### Step 6 — Session placement

Constraint-satisfaction over the athlete's available days:

**Hard constraints** (never violated)
- Only on available days; never on blackout dates.
- Session duration ≤ that day's stated minutes.
- ≥ 1 full rest day per week (2 for first-timers).
- Never two Z4+ sessions on consecutive days for first-timers.
- Long ride and long run never on consecutive days (unless deliberately paired as a Build-phase brick).

**Soft constraints** (violated only when necessary, with a warning)
- Long sessions on the athlete's stated long days.
- Swim early in the week (pool availability, and it's the session most often skipped).
- Brick sessions on weekends.
- Hard sessions after a rest day.
- Keep the same weekly *shape* week to week — habit beats optimality.

### Step 7 — Session materialization

Each slot becomes a concrete structured session from the workout library, scaled to the target duration and phase.

```ts
interface Session {
  id: string;
  date: string;
  discipline: Discipline;
  title: string;
  purpose: string;                 // required, plain English, ≤ 140 chars
  plannedDurationSec: number;
  plannedLoad: number;
  steps: Step[];                   // warm-up, main, cool-down
  tags: ('brick' | 'openwater' | 'test' | 'skills' | 'race-sim' | 'key')[];
  alternatives: { shorter?: SessionRef; indoor?: SessionRef; crossTrain?: SessionRef };
}

interface Step {
  label: string;                   // "Main set"
  durationSec?: number;
  distanceM?: number;              // swim sets are distance-based
  repeats?: number;
  targetZone: 1 | 2 | 3 | 4 | 5;
  cue: string;                     // "Comfortable — you could hold a conversation"
  recovery?: { durationSec: number; targetZone: 1 | 2 };
}
```

Mandatory inclusions when feasible:
- **Bricks** from the start of Build — at least one every 10 days.
- **Open water** — at least 2 sessions before race day if the race is open water, the first scheduled ≥ 4 weeks out.
- **Race simulation** — one session at ~60–70% of race distance in the Peak phase, in race kit, with race fuelling.
- **Transition rehearsal** — at least once, attached to a brick.

---

## Workout library

Sessions are templates parameterized by duration and zone. Each has a stable `templateId`.

### Swim
| Template | Phase | Shape |
|---|---|---|
| `swim.technique` | all | Drills + short repeats, lots of rest. The default for learn-track. |
| `swim.endurance` | base | Continuous or long repeats (e.g. 4 × 200 m) at Z2 |
| `swim.css` | build | 6–10 × 100 m at CSS, short rest |
| `swim.speed` | build/peak | 10–16 × 50 m fast, full recovery |
| `swim.openwater` | build/peak | Sighting, straight-line, group-start practice |
| `swim.racesim` | peak | Continuous race distance, wetsuit, race start effort |

### Bike
| Template | Phase | Shape |
|---|---|---|
| `bike.endurance` | base | Steady Z2, duration is the variable |
| `bike.cadence` | base | Cadence drills, single-leg, spin-ups |
| `bike.tempo` | base/build | 2–3 × 12–20 min Z3 |
| `bike.threshold` | build | 3–5 × 8–12 min Z4, equal recovery |
| `bike.vo2` | build/peak | 5–8 × 3 min Z5, full recovery |
| `bike.racepace` | peak | Sustained at target race intensity |

### Run
| Template | Phase | Shape |
|---|---|---|
| `run.walkrun` | prep | Run/walk intervals — the learn-to-run entry point |
| `run.easy` | all | Continuous Z2 |
| `run.long` | base/build | The week's longest, Z2, progressive duration |
| `run.tempo` | build | 20–30 min Z3 |
| `run.intervals` | build/peak | 6–10 × 400–800 m Z5 |
| `run.brickrun` | build/peak | Short run straight off the bike, deliberately at Z2–Z3 |

### Combined
| Template | Shape |
|---|---|
| `brick.bikerun` | Bike then immediate run. The signature triathlon session. |
| `brick.swimbike` | Less common; rehearses T1 and post-swim disorientation. |
| `strength.core` | Bodyweight core/hip work, 20 min, home-friendly |
| `strength.gym` | Compound lifts, off-season and base only |
| `mobility.recovery` | Stretch/mobility flow for rest days |

---

## Adaptation engine

Runs (a) after every session log, and (b) nightly via cron for the whole active user set. Pure function over recent history → a list of `PlanAdjustment`s, each with a human-readable reason.

```ts
interface PlanAdjustment {
  type: 'reduce_intensity' | 'reduce_volume' | 'increase_ramp' | 'reschedule'
      | 'drop_session' | 'insert_recovery' | 'replan' | 'return_to_training';
  scope: { weekStart: string; sessionIds?: string[] };
  reason: string;         // shown verbatim to the user
  magnitude: number;      // e.g. 0.85 = scale to 85%
  undoable: true;
}
```

### Rules

| # | Trigger | Action |
|---|---|---|
| A1 | Session missed, within ramp headroom | Reschedule **once** to a later day this week |
| A2 | Session missed, no headroom | Drop it. Never carry more than one missed session forward. |
| A3 | ≥ 3 consecutive missed days | Offer full re-plan from today |
| A4 | RPE ≥ 8 on ≥ 2 sessions planned as Z1–Z2 in 7 days | Reduce next week's intensity to 85%; insert an extra easy day |
| A5 | RPE ≤ 4 on ≥ 80% of sessions for 2 weeks, all completed | Permit ramp at the tier's upper bound next block |
| A6 | Freshness < −30 for 5+ consecutive days | Insert a recovery week now; defer the build |
| A7 | Illness flagged | Pause plan; on return, run the return-to-training ramp |
| A8 | Pain flagged (not soreness) | Drop that discipline for 3 days, substitute cross-training, surface "see a professional" guidance |
| A9 | Completed load < 60% of planned for 2 consecutive weeks | Rebase the plan to actual volume — the plan was wrong, not the athlete |
| A10 | New test result | Recompute zones and re-materialize all future session targets |
| A11 | Race date changed | Re-block phases from today, preserving completed history |
| A12 | Weather severe on an outdoor session | Offer indoor alternative or a day swap (advisory only) |

**Ordering:** safety rules (A7, A8) pre-empt everything. At most **one** adjustment note is shown per day; the rest are applied silently and listed in a "plan history" view.

### Return-to-training ramp

After a break, resume at a fraction of pre-break load and rebuild:

| Days off | Resume at | Rebuild over |
|---|---|---|
| ≤ 3 | 100% | — |
| 4–7 | 80% | 1 week |
| 8–14 | 65% | 2 weeks |
| 15–28 | 50% | 3 weeks |
| > 28 | Regenerate plan from current state | — |

After illness with fever, add a mandatory 2 easy days per fever day before any Z3+ work.

---

## Race prediction

Presented as a **range**, never a point estimate.

```
predictedTime = swimTime + T1 + bikeTime + T2 + runTime
```

Per leg, from demonstrated training performance:

- **Swim:** best sustained pace over ≥ race distance × 0.6, +5–10% for open water (sighting, contact, no wall push-offs), +wetsuit bonus of ~3–5% if applicable.
- **Bike:** sustainable race intensity — for a first-timer, Z2–low Z3; apply a course terrain factor.
- **Run:** training pace at Z2–Z3, **+8–15% slower** to account for running off the bike. First-timers sit at the pessimistic end.
- **Transitions:** first-timer 3–5 min combined; experienced 1–2 min.

Range width reflects data confidence: ±15% with onboarding answers only, narrowing to ±5% with 8+ weeks of logged sessions. The UI always states which.

---

## Safety rails

Non-negotiable, enforced in code, never overridable by the adaptation engine or by AI features.

**Load**
- Weekly load increase hard-capped at **+10%**; rolling 4-week increase at **+30%**.
- Long run duration increase capped at **+10%/week** for all tiers.
- Recovery weeks cannot be removed, only moved by ≤ 2 days.
- Maximum 4 hard sessions/week regardless of tier or request.

**Health**
- Fever, or symptoms below the neck → **full rest**, plan paused. No negotiation, no "easy version".
- Pain (sharp, localized, or worsening) is treated differently from soreness. Pain drops the discipline and shows professional-help guidance. The app never diagnoses, never names a condition, never suggests a treatment.
- Persistent overload signals (elevated resting HR + poor sleep + high RPE at low intensity) surface an overtraining warning and a forced easy block.

**Open water**
- Never scheduled without a safety module ([F-12](01-product-spec.md#f-12--confidence--skills-track--p1)) being shown first.
- Copy always includes: swim with others or in a supervised venue, use a tow float, know the water temperature, enter gradually.
- Water below 14 °C triggers a cold-water warning and a duration cap suggestion.

**Environment**
- Heat: above ~28 °C (or high humidity), suggest reducing intensity by one band, moving the session, or shortening it.
- Air quality and lightning: suggest moving indoors.

**Boundaries**
- The app produces training suggestions from published coaching heuristics. It is not medical advice.
- Any AI-assisted feature ([F-31](01-product-spec.md#f-31--ai-coach-chat--p2)) is bound by these rails and cannot author a plan that violates them — the generator validates every plan against the rails before it is persisted.

---

## Testing requirements

`lib/training/` must be covered by unit tests. Non-negotiable cases:

- Ramp cap holds across 52 generated weeks for every tier.
- Every generated plan passes the safety-rail validator (property test over randomized profiles).
- Recovery weeks are always ≥ 30% lighter than the preceding week.
- Blackout dates are always empty.
- Load is identical whether computed from power, HR, or the RPE fallback for an equivalent session (within tolerance).
- Fitness/Fatigue EWMAs reproduce known reference series.
- Taper never compressed below the per-distance minimum.
- Infeasible goals return a warning, never a plan.
- Adaptation is idempotent: applying the same log twice produces one adjustment.
