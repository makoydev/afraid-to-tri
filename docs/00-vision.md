# 00 — Vision & Principles

## The problem

Triathlon has an unusually high barrier to entry, and almost none of it is physical.

1. **Three sports, three sets of jargon.** A beginner has to learn FTP, CSS, LTHR, bricks, T1/T2, cadence, and zone systems before they can read a plan.
2. **Plans are static PDFs.** Most free plans are a 16-week spreadsheet. Miss a week to a cold and the plan is now wrong, and there's no mechanism to fix it.
3. **Apps are built for people who are already fast.** The dominant tools are analytics-first: charts, power curves, load metrics. They tell an experienced athlete a lot and a nervous beginner nothing actionable.
4. **The scary parts are never addressed.** Open water panic, the chaos of a transition area, whether you're allowed to walk, what happens if you're last. This is what actually stops people signing up — and no app talks about it.

The name is the thesis: the hard part isn't the training, it's being **afraid to tri**.

## Positioning

> **Afraid to Tri is a coach in your pocket for your first (or first few) triathlons.**

|  | TrainingPeaks / intervals.icu | Strava | Generic PDF plans | **Afraid to Tri** |
|---|---|---|---|---|
| Primary user | Coached / data-driven athlete | Social athlete | Anyone | Anxious beginner → improver |
| Core loop | Analyze | Share | Read | **Do today's workout** |
| Adapts to missed sessions | Manual | n/a | No | **Automatic** |
| Explains itself | No | No | No | **Always** |
| Guides you during the session | Limited | No | No | **Yes, full-screen, offline** |

We are not trying to out-analyze TrainingPeaks. We are trying to be the app that gets someone from "I could never" to a finisher photo — and then keeps them when they get faster.

## Who it's for

### Primary — "Sam, the nervous first-timer"
- 32, runs 5k occasionally, hasn't swum since school, owns a hybrid bike.
- Signed up for a sprint tri in 14 weeks because a friend dared them.
- **Fears:** drowning, being last, looking stupid in transition, not knowing what to wear.
- **Needs:** to be told exactly what to do today, in plain English, with zero setup.
- **Fails if:** the first screen asks for FTP.

### Secondary — "Priya, the improver"
- 41, finished two sprints, wants to do a 70.3 next season.
- Owns a Garmin, cares about pace, starting to care about numbers.
- **Needs:** structure, zone-based sessions, real progress evidence, race-specific prep.
- **Fails if:** the app is so simplified it can't express a 4×8min threshold set.

### Tertiary — "Coach Dan" *(Phase 4)*
- Coaches 6 athletes on the side, currently juggling spreadsheets and WhatsApp.
- **Needs:** roster view, plan templates, comments on sessions.

The product must let Sam become Priya without ever hitting a wall or a rebuild. Progressive disclosure is the mechanism (see Principle 2).

## Principles

**1. One decision per screen.**
The home screen answers exactly one question: *what am I doing today?* Everything else is a tap away, not on the surface.

**2. Progressive disclosure of complexity.**
Sam sees "Easy ride, 40 min, you should be able to hold a conversation." Priya, on the same session, can flip to "Z2, 40 min, 65–75% FTP." Same data, two altitudes. Complexity is *unlocked*, never *front-loaded*.

**3. Never show jargon without an escape hatch.**
Every domain term renders as a tappable chip that opens a plain-English definition ([Glossary](10-glossary.md)). No exceptions, including in generated plan text.

**4. The plan is a living thing, not a document.**
Missing a session is normal and expected. The app absorbs it silently and re-shapes forward. It never scolds, never shows a broken streak as a failure, never leaves the user staring at red.

**5. Offline is the default assumption.**
Pools have no signal. Trails have no signal. Every part of executing and logging a workout must work fully offline and sync later. A session must never be lost because of connectivity.

**6. Thumb-first, one-handed, sweaty-handed.**
Primary actions live in the bottom third of the screen. Live-workout controls are large enough to hit while moving, wet, or wearing gloves.

**7. Encouragement over guilt.**
Copy is warm and specific. Celebrate consistency and effort, not just PRs. Never use red for "you missed something." Never use a streak mechanic that punishes rest.

**8. Honest about uncertainty.**
Estimated numbers are labelled as estimates. Predictions come with ranges. We never dress a heuristic up as a measurement.

## Non-goals

Explicitly **not** building, at least through Phase 4:

- A general-purpose activity tracker or GPS recorder. We consume activities from Strava/Garmin/Health; we don't compete with them on recording. *(A minimal built-in GPS recorder is a Phase 3 fallback only.)*
- A social feed with likes and kudos. Strava owns that.
- Nutrition tracking or calorie counting. Race-day fuelling *guidance* only.
- Medical, injury-diagnosis, or physiotherapy advice.
- Marketplace, race registration, or e-commerce.
- Desktop-optimized layouts. Desktop gets a responsive, readable version — never a bespoke one.

## Success metrics

The thing we actually care about is the finish line, so the north star is completion, not engagement.

**North star:** % of users who start a plan and complete their target race.

| Metric | Definition | Target (12 mo) |
|---|---|---|
| Onboarding completion | Signup → plan generated | > 70% |
| Week-1 activation | ≥ 3 sessions logged in first 7 days | > 45% |
| 4-week retention | Active in week 4 of a plan | > 40% |
| Plan adherence | Completed ÷ scheduled sessions | > 65% median |
| Guided-session usage | Sessions started in live mode | > 50% |
| Race completion | Users reaching a logged race result | > 25% of plan starters |
| Time-to-first-value | Signup → first plan visible | < 90 seconds |

**Anti-metrics** — if these rise, something has gone wrong: session-open rate without any logging (lurking), average time spent per day (we want *less*), notification opt-out rate.

## Constraints

- Mobile-first, built as a PWA; must be usable on a 3-year-old mid-range Android on a bad connection.
- Solo/small-team build — favour managed services over bespoke infrastructure.
- Free tier must be genuinely useful; monetization (if any) is deferred past Phase 3.
- Must run within Supabase + Vercel free/hobby tiers during development.
