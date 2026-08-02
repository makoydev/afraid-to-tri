# 01 — Product Spec

Features are grouped by phase. **Phase 1 is the MVP** — it must be shippable and genuinely useful on its own. Later phases are specified at lower fidelity on purpose; they'll be sharpened before they're built.

Each feature has an ID (`F-xx`), a user story, behaviour, and acceptance criteria. IDs are stable and referenced from other docs.

Priority: **P0** = MVP cannot ship without it · **P1** = should be in the phase · **P2** = nice to have.

---

## Phase 1 — MVP

### F-01 · Account & auth · P0

**Story:** As a new user, I can get into the app without friction and keep my data across devices.

- Email magic link (passwordless) + Apple and Google OAuth.
- Anonymous "try it" mode: a user can complete onboarding and see a generated plan **before** creating an account. Account creation upgrades the anonymous session in place and keeps all data.
- Session persists indefinitely; refresh tokens rotate silently.
- Account deletion available in-app; hard-deletes all rows within 30 days.

**Acceptance**

- [ ] A user can reach a generated plan without ever entering an email.
- [ ] Signing up after anonymous onboarding preserves the plan, profile, and any logged sessions.
- [ ] Auth state survives a cold app launch offline (cached session).
- [ ] Deleting an account removes all personal rows and revokes integration tokens.

---

### F-02 · Onboarding wizard · P0

**Story:** As a nervous beginner, I answer a handful of easy questions and get a plan, without needing to know any jargon.

Six steps, each one screen, each skippable except goal and availability. Progress bar at top, back always available. Full flow in [02-user-flows.md](02-user-flows.md#a-onboarding).

| Step               | Asks                                                                                                | Notes                                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1 · Goal           | Race distance + date, **or** "just get fitter" (no date)                                            | Distance picker uses plain descriptions, not just names: _Sprint — 750 m swim, 20 km bike, 5 km run. About 1h20 for most first-timers._ |
| 2 · Starting point | Per discipline: comfortable continuous distance/time, plus one-tap confidence rating (😰 / 🙂 / 💪) | No pace or HR asked. "Can't swim yet" is a first-class answer that unlocks the Learn-to-Swim track (F-12).                              |
| 3 · Availability   | Days per week + typical minutes per day + which days are long-session friendly                      | Drives total plan volume.                                                                                                               |
| 4 · Equipment      | Bike type, pool access, gym/trainer, watch/HR strap                                                 | Gates workout types (e.g. no trainer → no ERG-style sets).                                                                              |
| 5 · Constraints    | Injuries/limitations (free text + common chips), blackout dates (holidays)                          | Blackout dates are respected by the generator, not just greyed out.                                                                     |
| 6 · Preview        | Shows generated plan summary + week 1, then "Start plan"                                            | Editable before committing.                                                                                                             |

**Behaviour**

- Answers are persisted after every step (resumable if the user drops out).
- If no race date: generates a rolling 12-week base-building block that extends itself.
- Estimated finish time shown as a **range**, clearly labelled an estimate.

**Acceptance**

- [ ] Median completion time under 90 seconds on a phone.
- [ ] Every step is reachable and completable one-handed.
- [ ] No screen contains an unexplained domain term.
- [ ] Dropping out at step 4 and returning next day resumes at step 4.

---

### F-03 · Plan generation · P0

**Story:** As an athlete, I get a periodized, week-by-week plan sized to my race, my fitness, and my actual free time.

Full algorithm in [03-training-model.md](03-training-model.md#plan-generation). Summary of behaviour:

- Works backwards from race date through **Taper → Peak/Build → Base → Prep** phases.
- Weekly volume respects the user's stated hours; ramp rate capped (see safety rails).
- Build/recovery cycling (3:1, or 2:1 for older/lower-volume athletes).
- Discipline balance weighted toward the user's weakest and the race's most time-consuming leg.
- Includes brick sessions from the Build phase, plus at least one open-water session and one full race-simulation before race day where feasible.
- If the runway is too short for the goal, the app says so honestly and offers: _shorter distance_, _later race_, or _"finish, don't race" mode_ with reduced intensity.

**Acceptance**

- [ ] A plan is generated in under 2 seconds for a 24-week race horizon.
- [ ] Total weekly hours never exceed the user's stated availability by more than 10%.
- [ ] Week-over-week load increase never exceeds the configured ramp cap.
- [ ] Every recovery week is at least 30% lighter than the preceding week.
- [ ] Blackout dates contain no scheduled sessions.
- [ ] An 8-week runway to an Ironman produces an honest warning, not a plan.

---

### F-04 · Today screen (home) · P0

**Story:** As a user opening the app, I immediately know what I'm doing today and can start it in one tap.

The default screen. Single-column, scrollable, with:

1. **Hero card** — today's session: discipline icon, title, duration, one-line purpose ("Builds your aerobic base — this should feel easy"), and a large **Start** button. If a rest day: a rest card that explicitly frames rest as training.
2. **Race countdown** — days to race, current plan phase, and a one-line "where you are" ("Week 6 of 14 · Base phase").
3. **This week strip** — 7 day-dots showing planned discipline, completion state, and today's marker. Tap a day to jump to it.
4. **Nudge slot** — at most one contextual card: an unlogged session from yesterday, a due fitness check-in, an unread coach comment, a weather warning for a planned outdoor session.

**Acceptance**

- [ ] First meaningful paint under 1.5 s on a mid-range Android over 3G.
- [ ] Screen is fully usable offline from cache.
- [ ] Start button reachable by an average thumb without shifting grip.
- [ ] Maximum one nudge card at a time.
- [ ] Rest days never render as an empty or error state.

---

### F-05 · Calendar · P0

**Story:** As an athlete, I can see the shape of my training and move things around my life.

- **Week view** (default, mobile) and **month view** (density heat by load).
- Drag or long-press to **move** a session to another day; the app validates (no two hard days back-to-back, no run the day after a long run) and warns rather than blocks.
- **Swap** two sessions in a week.
- Mark a session **skipped** with a one-tap reason (ill / travel / tired / life). Reason feeds adaptation (F-08).
- Add an **ad-hoc session** not in the plan.
- Past sessions show planned vs. actual side by side.

**Acceptance**

- [ ] Dragging a session to a new day updates the plan and recomputes weekly load.
- [ ] Moving a session that creates a conflict shows a non-blocking warning with a one-tap "fix it for me".
- [ ] Week view renders 7 days without horizontal scrolling at 360 px width.
- [ ] All calendar mutations queue and sync when offline.

---

### F-06 · Workout detail · P0

**Story:** Before I start, I understand what I'm about to do and why.

- Structured step list (warm-up / main set / cool-down) with duration, target zone, and plain-language target ("comfortable — you could chat").
- **Why this session** — one short paragraph, always present.
- Zone targets shown in the user's chosen altitude: feel-based (RPE + talk test) by default, pace/HR/power if they've unlocked it.
- Swim sessions render as pool sets (`4 × 50 m @ easy, 20 s rest`) with total distance and an optional lap-count aid.
- Alternatives: **"I can't do this today"** → offers a shorter version, an indoor version, or a different discipline.

**Acceptance**

- [ ] Every session has a non-empty purpose string.
- [ ] Structured steps sum to the stated total duration (±1 min).
- [ ] The alternatives sheet always returns at least one viable option.

---

### F-07 · Live guided workout · P0

**Story:** During the session, my phone tells me what to do so I never have to think or squint.

Full-screen, high-contrast, minimal-chrome mode. See flow in [02-user-flows.md](02-user-flows.md#c-live-workout).

- **Giant current-step display**: what to do, target, and a countdown ring for the step. Next step previewed small underneath.
- **Audio cues** via Web Speech / pre-rendered audio: step start, 10-second warning, halfway, step complete, session complete. Works with the screen off and over music (ducking).
- Controls: pause/resume, skip step, extend step, end session. All ≥ 64 px targets.
- **Wake lock** while active; auto-releases on pause.
- Optional live HR from a Bluetooth strap via Web Bluetooth, with an in-zone / out-of-zone colour band. Degrades silently if unsupported.
- Fully offline: session definition and audio cached before start; timers run locally.
- **Crash recovery**: state is checkpointed every 5 s; relaunching within 6 hours offers to resume.

**Acceptance**

- [ ] A 60-minute session runs to completion with the device in flight mode.
- [ ] Audio cues fire correctly with the screen locked.
- [ ] Killing the app mid-session and reopening offers resume with correct elapsed time.
- [ ] Battery cost under 12% for a 60-minute session with screen off on a reference device.
- [ ] All controls hittable with a wet thumb (≥ 64 px, ≥ 12 px spacing).

---

### F-08 · Logging & adaptation · P0

**Story:** After a session I log it in seconds, and my plan adjusts to how it actually went.

**Logging** — the post-session screen asks for as little as possible:

- One-tap **RPE** (1–10, shown as five labelled faces mapping to a 1–10 scale).
- Optional: actual duration/distance (pre-filled from live mode), one-line note, a "how did the body feel" flag (fine / niggle / pain — pain triggers the injury path).
- If the session came from Strava/Garmin (F-11), everything is pre-filled and the user just confirms.

**Adaptation** — rules run nightly and after each log. Full logic in [03-training-model.md](03-training-model.md#adaptation-engine).

- Missed sessions decay rather than pile up: never reschedule more than one missed session forward, never grow a week beyond its ramp cap.
- Repeated high RPE on easy sessions → reduce next week's intensity.
- Repeated low RPE with completed volume → allow a slightly faster ramp.
- 3+ consecutive missed days → offer a re-plan rather than silently continuing.
- Illness/injury flag → automatic reduced-load return-to-training ramp.
- **Every adjustment is announced** in plain language and is undoable.

**Acceptance**

- [ ] Logging a completed session takes ≤ 2 taps in the common case.
- [ ] Missing a week produces a rebalanced plan, not a backlog.
- [ ] Every automatic change appears in a visible "what changed and why" note.
- [ ] Any adaptation can be reverted from that note.
- [ ] Logging works offline and syncs later without duplication.

---

### F-09 · Progress & fitness · P1

**Story:** I can see that I'm actually getting fitter, in terms I understand.

- **Consistency first**: sessions completed, hours trained, longest swim/bike/run — the numbers a beginner feels.
- **Fitness / Fatigue / Freshness** chart (generic-named load model, see [03](03-training-model.md#load-model)), shown only once there's ≥ 3 weeks of data, and always with a plain-English reading ("Fitness rising, fatigue high — that's normal mid-build").
- Per-discipline trend: easy-pace at a given effort over time (the most honest beginner progress signal).
- **Milestones**: first 1 km swim, first 40 km ride, first brick, first hour run — celebrated as cards, shareable as an image.
- Predicted race time as a **range**, updating as data accumulates, with confidence stated.

**Acceptance**

- [ ] No chart renders without enough data to be meaningful — shows an explainer instead.
- [ ] Every chart has a one-sentence interpretation underneath.
- [ ] Milestone cards export as a shareable image without any account required.

---

### F-10 · Race day toolkit · P0 _(user-prioritized)_

**Story:** I know exactly what happens on race day, so the unknown stops being scary.

- **Countdown** with phase context, surfaced on the Today screen from day one.
- **Taper explainer** — when taper starts, the app explains why less is more, because reduced volume feels wrong to beginners and is a common point of panic.
- **Gear checklist** — generated from race type, distance, water temperature and equipment answers; checkable, persists, printable/shareable. Split into T1 bag / T2 bag / on-body / morning-of.
- **Race walkthrough** — a short, staged explainer: registration, racking, body marking, swim start types, T1, the bike leg and drafting rules, T2, the run, the finish. Written for someone who has never seen a race.
- **Pacing plan** — target splits per leg derived from recent training, deliberately conservative, with a "your first one is about finishing" framing.
- **Fuelling guide** — simple carbs-per-hour and fluid guidance by distance and expected conditions, framed as a starting point to test in training. Explicitly not nutrition tracking.
- **Race week schedule** — day-by-day, including the pre-race day, with sleep and travel notes.
- **Post-race**: log result, capture a reflection, then a guided recovery week and a "what next" prompt.

**Acceptance**

- [ ] Checklist is generated, not static, and reflects wetsuit-legality by water temperature.
- [ ] Walkthrough is fully readable offline.
- [ ] Pacing targets are never more aggressive than the athlete's demonstrated training paces.
- [ ] Fuelling guidance carries a visible "test this in training" caveat.

---

### F-11 · Activity import — Strava · P0 _(user-prioritized)_

**Story:** My watch already records everything; I shouldn't type it in again.

- OAuth connect to Strava; webhook subscription for new activities.
- Incoming activities are **matched** to planned sessions by date, discipline, and duration proximity; near-matches prompt for confirmation, exact matches auto-complete.
- Imports duration, distance, average/max HR, elevation, and the activity's own name/notes. Streams (HR/pace over time) fetched lazily for sessions the user opens.
- Manual "import last 30 days" backfill on first connect, used to seed initial fitness estimates.
- Disconnect revokes tokens and stops all sync; imported data is retained unless the user deletes it.

**Acceptance**

- [ ] A ride finished on a Garmin appears in the app within 5 minutes without user action.
- [ ] The same activity is never imported twice (idempotent on external ID).
- [ ] Ambiguous matches ask rather than guess.
- [ ] Backfill of 30 days completes in under 60 seconds and never blocks the UI.

---

### F-12 · Confidence & skills track · P1

**Story:** The parts of triathlon that actually scare me are addressed directly.

This is the feature that earns the app's name. Short, calm, mostly-text modules with optional embedded drills, delivered contextually (the open-water module appears the week before the first open-water session, not in a menu nobody opens).

- **Learn to swim / swim confidence** — breathing, bilateral basics, front-crawl progression, what to do when you panic, treading water, backstroke as a legal rest stroke.
- **First open water** — cold shock, sighting, wetsuit fit, mass starts, the "it's fine to stop and float" rule, always-with-a-buddy safety rules.
- **Bike handling** — cornering, bottle grab, riding in a group, basic roadside repair (puncture) with a practise-at-home prompt.
- **Transition rehearsal** — a guided at-home drill for laying out and moving through T1/T2.
- **The mental stuff** — being last, DNF-ing, race-morning nerves, imposter feelings.

**Acceptance**

- [ ] Modules surface contextually at least once each during a standard 14-week sprint plan.
- [ ] Every module is under 3 minutes to read.
- [ ] All content available offline.
- [ ] Safety-critical modules (open water, cold) cannot be dismissed permanently without being opened once.

---

### F-13 · PWA & offline · P0 _(user-prioritized)_

**Story:** The app works on a pool deck, in a basement, and on a mountain.

- Installable (manifest, icons, splash, standalone display, iOS meta).
- Service worker: app shell precached; plan and workout data cached stale-while-revalidate; next 7 days of sessions plus their audio assets pre-cached aggressively.
- All mutations (log, skip, move, note) queue in IndexedDB and replay on reconnect via Background Sync, with a fallback replay on app focus.
- **Conflict policy:** last-write-wins per field, except session logs, which are never overwritten by server state — client wins.
- Visible connectivity state and a "3 changes waiting to sync" indicator; never a blocking spinner.

**Acceptance**

- [ ] Cold-launch in flight mode reaches a usable Today screen.
- [ ] A workout logged offline appears server-side after reconnect exactly once.
- [ ] Installing to home screen produces a standalone app with no browser chrome.
- [ ] Lighthouse PWA + Performance ≥ 90 on mobile.

---

### F-14 · Notifications · P1

- Web Push: session reminder (user-set time), missed-session nudge (max 1/day), race countdown milestones, coach comments (Phase 4).
- Frequency-capped; quiet hours honoured; per-category toggles.
- Never guilt-framed. "Rest day today — enjoy it" is a valid notification.

**Acceptance**

- [ ] Never more than 2 pushes per day.
- [ ] Full opt-out available and respected immediately.
- [ ] iOS install-to-home-screen requirement for push is explained rather than silently failing.

---

## Phase 2 — Depth

### F-20 · Garmin Connect integration · P1

Direct Garmin OAuth + push service as an alternative to Strava, including **workout push**: tomorrow's structured session sent to the watch. See [07-integrations.md](07-integrations.md).

### F-21 · Apple Health / Health Connect · P2

Read workouts, resting HR, HRV, sleep. Feeds readiness (F-23).

### F-22 · Fitness tests & zones · P1

Guided protocols with in-app timers: run threshold test, bike 20-min test, swim CSS test (400 m + 200 m). Results set personalized zones; the app schedules retests every 6–8 weeks. Zones are _unlocked_ by testing, keeping beginners on RPE until they're ready.

### F-23 · Readiness check-in · P2

Optional 10-second morning check: sleep, soreness, motivation, plus resting HR/HRV if available. Produces a readiness band that can soften or harden today's session. Advisory only, always overridable.

### F-24 · Route & weather awareness · P2

Weather forecast on outdoor sessions; heat/cold/wind guidance; auto-suggests moving an outdoor session indoors, or swapping days, when the forecast is bad.

### F-25 · Multi-race season planning · P2

Multiple A/B/C races in a season, with the plan periodized around priorities rather than a single target.

### F-26 · Equipment tracker · P2

Bike/shoe/wetsuit mileage, chain-wear and shoe-replacement reminders.

---

## Phase 3 — Intelligence

### F-30 · Adaptive plan v2 · P1

Replace rule-based adaptation with a model that fits the individual's response curve: personalized ramp rates, discipline-specific fatigue decay, and predicted-vs-actual session outcomes.

### F-31 · AI coach chat · P2

Conversational Q&A grounded in the user's own plan and data ("why is this week easier?", "can I move Thursday?"), able to _propose_ plan changes that the user approves. Hard guardrails: no medical advice, no override of safety rails, always cites the plan data it used.

### F-32 · Race-time prediction v2 · P2

Distance-specific models per discipline, including transition-time estimates and terrain adjustment.

### F-33 · Built-in GPS recording · P2

Fallback recorder for users with no watch — record run/ride from the phone during a live session.

---

## Phase 4 — Community & coaching _(user-prioritized)_

### F-40 · Training buddies · P1

Follow friends, see their week (not a feed — a small circle), send a nudge, share a milestone card. Deliberately low-surface: no likes, no public leaderboard.

### F-41 · Shared/plan templates · P2

Publish a plan you completed as a template others can start from; browse community templates by distance and hours-per-week.

### F-42 · Coach ↔ athlete · P1

Coach accounts with a roster, plan authoring and assignment, per-session comments, and athlete-visible feedback. Athlete consent required and revocable; coach sees only what the athlete shares.

### F-43 · Groups & club challenges · P2

Club/team spaces with group plans and non-competitive consistency challenges.

---

## Cross-cutting requirements

| Area               | Requirement                                                                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Accessibility**  | WCAG 2.2 AA. Full keyboard/screen-reader support. Live workout must be usable with VoiceOver/TalkBack and respects `prefers-reduced-motion`. Never colour alone to convey state. |
| **Performance**    | LCP < 2.0 s on mid-range Android/3G. Interaction latency < 100 ms. Initial JS budget ≤ 180 KB gzipped.                                                                           |
| **Privacy**        | GDPR-compliant. Data export (JSON + GPX/FIT where applicable) and hard delete. No third-party analytics that sell data. Health data never used for advertising.                  |
| **Units**          | Metric/imperial toggle, respected everywhere including generated copy and audio cues.                                                                                            |
| **i18n**           | English at launch, but all user-facing strings externalized from day one.                                                                                                        |
| **Error handling** | Never lose user input. Every failure state offers a next action. Sync failures are visible but non-blocking.                                                                     |
