# 09 — Roadmap

Phases are sequential and gated: a phase doesn't start until the previous one's exit criteria are met. Week counts assume one focused developer and are estimates, not commitments.

---

## Phase 0 — Foundations · ~2 weeks

Nothing user-visible. The point is that everything after this is fast.

- [ ] Next.js 15 + TypeScript strict + Tailwind, with the token layer from [06](06-design-system.md) wired into `theme.extend`
- [ ] Supabase project, local dev via CLI, migration workflow
- [ ] Auth (magic link + Apple + Google), including the anonymous → account upgrade path
- [ ] Core schema + RLS policies + the `tests/rls/` suite
- [ ] `components/ui/` primitives: Button, Card, Sheet, Chip, StatTile, EmptyState
- [ ] CI: typecheck, lint, unit, RLS, build, Lighthouse budget
- [ ] Sentry, structured logging, error boundaries

**Exit:** a signed-in user reaches an empty Today screen; a second user provably cannot read their rows; CI is green and enforcing the performance budget.

---

## Phase 1 — MVP · ~8 weeks

Everything needed for someone to go from "I might do a triathlon" to crossing a finish line.

### Milestone 1.1 — The engine (~2 wk)
- [ ] `lib/training/` complete: zones, load, generator, adaptation, safety validator, prediction
- [ ] Workout template library
- [ ] Unit tests including the property test over randomized profiles

*Built first and in isolation, because it's the highest-risk and highest-value part, and it has no UI dependencies.*

### Milestone 1.2 — Onboarding & plan (~1.5 wk)
- [ ] 6-step wizard ([F-02](01-product-spec.md#f-02--onboarding-wizard--p0)), resumable, pre-auth
- [ ] `POST /api/plan/generate` with `dryRun` preview
- [ ] Infeasibility screen with real alternatives
- [ ] Plan preview → commit

### Milestone 1.3 — The daily loop (~2 wk)
- [ ] Today screen ([F-04](01-product-spec.md#f-04--today-screen-home--p0)) with hero card, countdown, day strip, nudge slot
- [ ] Calendar week + month, drag to move, swap, skip ([F-05](01-product-spec.md#f-05--calendar--p0))
- [ ] Workout detail with alternatives ([F-06](01-product-spec.md#f-06--workout-detail--p0))
- [ ] Post-session logging + adaptation notes ([F-08](01-product-spec.md#f-08--logging--adaptation--p0))

### Milestone 1.4 — Live workout & offline (~2 wk)
- [ ] Full-screen guided session, audio cues, wake lock ([F-07](01-product-spec.md#f-07--live-guided-workout--p0))
- [ ] Crash recovery + checkpointing
- [ ] Service worker, precache tiers, outbox, background sync ([F-13](01-product-spec.md#f-13--pwa--offline--p0-user-prioritized))
- [ ] Playwright offline e2e: log a session in flight mode, reconnect, assert exactly one row

*The riskiest UI work. Budget for it to overrun.*

### Milestone 1.5 — Strava & race day (~1.5 wk)
- [ ] Strava OAuth, webhooks, backfill, matching ([F-11](01-product-spec.md#f-11--activity-import--strava--p0-user-prioritized))
- [ ] Race toolkit: countdown, checklist, walkthrough, pacing, fuelling, race week ([F-10](01-product-spec.md#f-10--race-day-toolkit--p0-user-prioritized))
- [ ] Confidence modules ([F-12](01-product-spec.md#f-12--confidence--skills-track--p1)) — content written, contextual triggers wired
- [ ] Progress screen ([F-09](01-product-spec.md#f-09--progress--fitness--p1))
- [ ] Web push ([F-14](01-product-spec.md#f-14--notifications--p1))

**Exit criteria**
- [ ] 10 beta users complete onboarding and train for 4+ weeks
- [ ] Plan adherence > 50% among them
- [ ] Zero data-loss incidents from offline sync
- [ ] Lighthouse ≥ 90 on Performance and PWA, 100 on Accessibility
- [ ] At least one beta user finishes a real race using the app

The last one is the real gate. Everything else is a proxy for it.

---

## Phase 2 — Depth · ~6 weeks

Serve the improver without losing the beginner.

- [ ] Fitness tests + zone unlocking ([F-22](01-product-spec.md#f-22--fitness-tests--zones--p1))
- [ ] Garmin: activity import **and workout push to watch** ([F-20](01-product-spec.md#f-20--garmin-connect-integration--p1)) — *apply to the partner program in Phase 1, approval is the long pole*
- [ ] Readiness check-in ([F-23](01-product-spec.md#f-23--readiness-check-in--p2))
- [ ] Weather awareness ([F-24](01-product-spec.md#f-24--route--weather-awareness--p2))
- [ ] Multi-race season planning ([F-25](01-product-spec.md#f-25--multi-race-season-planning--p2))
- [ ] Equipment tracker ([F-26](01-product-spec.md#f-26--equipment-tracker--p2))
- [ ] Decision point: native shell (Capacitor) for Apple Health / Health Connect ([F-21](01-product-spec.md#f-21--apple-health--health-connect--p2))

**Exit:** an athlete who has done 2–3 triathlons finds nothing missing for a 70.3 build; 4-week retention > 40%.

---

## Phase 3 — Intelligence · ~6 weeks

Only once there's enough real data to learn from — this phase is meaningless before Phase 1 has produced months of logs.

- [ ] Adaptive plan v2, personalized response curves ([F-30](01-product-spec.md#f-30--adaptive-plan-v2--p1))
- [ ] AI coach chat, grounded in the athlete's own data, bound by the safety rails ([F-31](01-product-spec.md#f-31--ai-coach-chat--p2))
- [ ] Race-time prediction v2 ([F-32](01-product-spec.md#f-32--race-time-prediction-v2--p2))
- [ ] Built-in GPS recording as a no-watch fallback ([F-33](01-product-spec.md#f-33--built-in-gps-recording--p2))

**Exit:** predictions land within 5% for 70% of logged races; adaptive plans beat rule-based on adherence in an A/B test.

---

## Phase 4 — Community & coaching · ~6 weeks

- [ ] Training buddies ([F-40](01-product-spec.md#f-40--training-buddies--p1)) — small circles, no feed, no likes
- [ ] Coach ↔ athlete: roster, plan assignment, comments, consent scopes ([F-42](01-product-spec.md#f-42--coach--athlete--p1))
- [ ] Shared plan templates ([F-41](01-product-spec.md#f-41--sharedplan-templates--p2))
- [ ] Clubs and consistency challenges ([F-43](01-product-spec.md#f-43--groups--club-challenges--p2))

**Exit:** coaches manage a real roster without touching a spreadsheet; social features measurably help retention without adding comparison anxiety (watch the anti-metrics).

---

## Deliberately deferred

| Thing | Why not now |
|---|---|
| Monetization | Prove retention first. A subscription on an unproven product buys nothing but churn. |
| Native apps | The PWA covers everything except HealthKit. Revisit only if that becomes the blocker. |
| Localization | Strings are externalized from day one; translation waits for demand. |
| Nutrition tracking | Explicit non-goal. Race fuelling guidance only. |
| Advanced analytics (power curves, W′, VO₂ estimation) | Wrong audience. Would pull the product toward the users we're not building for. |
| Marketplace / race registration | Not our problem to solve. |

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Offline sync loses a workout | Medium | **Critical** — breaks all trust | Idempotency keys, client-wins on logs, e2e offline tests in CI, never discard a parked mutation |
| Generated plans are bad | Medium | Critical | Safety-rail validator on every plan, expert review of generator output, beta cohort before launch |
| Garmin partner approval denied or slow | Medium | High | Apply in Phase 1; Strava covers most users regardless |
| Strava API terms or limits change | Low | High | Never a hard dependency — manual logging always works |
| Live workout drains battery | Medium | High | Screen-off mode, wall-clock timers, CSS-only animation, measured budget in CI |
| iOS PWA limitations (push, background sync) | **High** | Medium | App-focus sync fallback; explain the install-to-home-screen requirement instead of failing silently |
| Scope creep into a general fitness app | High | Medium | The non-goals list in [00](00-vision.md#non-goals) is a contract, not a suggestion |
| Beginner content reads as condescending | Medium | Medium | Test copy with real first-timers; the tone table in [06](06-design-system.md#emotional-design) is reviewable |

---

## How we'll know it's working

Beyond the metrics in [00-vision](00-vision.md#success-metrics), the qualitative bar:

> A nervous beginner opens the app on a Tuesday morning, sees one card, taps Start, and does the session — without reading anything, without deciding anything, and without feeling judged about last Thursday.

If that's true, the product works. If it isn't, no feature fixes it.
