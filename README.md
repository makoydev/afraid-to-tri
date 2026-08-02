# Afraid to Tri

A mobile-first triathlon training app for people who want to do a triathlon but are quietly terrified of it.

Most training apps assume you already know what a brick is, what your FTP is, and why anyone would swim in a lake on purpose. **Afraid to Tri** assumes you don't — and gets you to a finish line anyway. It builds you a plan around a real race date, tells you exactly what to do today, walks you through the session with big buttons and audio cues, and adapts when life gets in the way.

> **Status:** Documentation phase. No application code yet.
> This repo currently contains the product, design, and technical specification that the build will follow.

---

## The one-paragraph pitch

You pick a race (or a distance and a date). The app generates a periodized swim/bike/run plan sized to your current fitness and how many hours a week you actually have. Every day it shows you one card: today's workout, why it exists, and a "Start" button. Tap it and you get a full-screen guided session — intervals, timers, spoken cues — that works with no signal, screen locked, in a pool or on a trail. Afterwards you rate how it felt in one tap, and the plan quietly re-shapes itself around you. As race day approaches, the app tapers you, runs you through a gear checklist, explains what actually happens in a transition area, and counts you down.

---

## Documentation

Read in this order:

| # | Doc | What's in it |
|---|-----|--------------|
| 00 | [Vision & Principles](docs/00-vision.md) | Problem, positioning, personas, principles, non-goals, success metrics |
| 01 | [Product Spec](docs/01-product-spec.md) | Every feature, phased, with acceptance criteria |
| 02 | [User Flows](docs/02-user-flows.md) | Onboarding, the daily loop, live workout, race week |
| 03 | [Training Model](docs/03-training-model.md) | Zones, load math, plan generation, adaptation, taper |
| 04 | [Data Model](docs/04-data-model.md) | Postgres schema, RLS policies, indexes |
| 05 | [Architecture](docs/05-architecture.md) | Stack, structure, offline/sync, jobs, environments |
| 06 | [Design System](docs/06-design-system.md) | Mobile-first layout, tokens, components, accessibility |
| 07 | [Integrations](docs/07-integrations.md) | Strava, Garmin, Apple Health / Health Connect |
| 08 | [API Contracts](docs/08-api.md) | Route handlers, payloads, errors |
| 09 | [Roadmap](docs/09-roadmap.md) | Phases, milestones, exit criteria |
| 10 | [Glossary](docs/10-glossary.md) | Every piece of triathlon jargon, in plain English |
| — | [ADRs](docs/adr/) | Architecture decision records |

Conventions for anyone (human or agent) writing code here: [CLAUDE.md](CLAUDE.md).

---

## Stack at a glance

- **Next.js 15** (App Router) + **TypeScript** + **Tailwind CSS**
- **Supabase** — Postgres, Auth, Storage, Realtime, Row Level Security
- **PWA** — installable, offline-first workout execution, background sync
- **Vercel** — hosting, cron, preview deploys
- Integrations: **Strava**, **Garmin Connect**, **Apple Health / Health Connect**

See [docs/05-architecture.md](docs/05-architecture.md) for the reasoning.

---

## Scope discipline

v1 is deliberately small: onboarding → plan → today's workout → guided session → log → progress. Everything else — social, coaching, nutrition, advanced analytics — is specified but explicitly deferred. See the [Roadmap](docs/09-roadmap.md).

---

## Safety note

This app produces training suggestions from well-known endurance-coaching heuristics. It is not medical advice, and it is not a substitute for a coach or a doctor. Safety rules that the product must enforce (illness handling, ramp-rate caps, open-water warnings, heat guidance) are specified in [docs/03-training-model.md § Safety rails](docs/03-training-model.md#safety-rails).

---

## License

TBD.
