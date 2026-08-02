# ADR-0001 — Next.js + Supabase + PWA

**Status:** Accepted · 2026-08-02

## Context

We need a mobile-first triathlon training app built by a very small team. The requirements that constrain the choice:

- Must feel like an app on a phone: installable, offline-capable, fast on mid-range Android.
- Needs a real relational database — plans, weeks, sessions and activities are deeply relational, and the training model does date-range and aggregate queries constantly.
- Needs per-user authorization that we cannot get wrong; this is health data.
- Needs server-side endpoints for OAuth callbacks and webhooks.
- One developer cannot maintain a bespoke backend, an auth system, and two native apps.

## Decision

**Next.js 15 (App Router) + Supabase + a PWA**, hosted on Vercel.

- Next.js gives us Server Components (small client bundles, which matters on a mobile budget) and route handlers (webhook and OAuth endpoints) in one deployment.
- Supabase gives us Postgres with Row Level Security, so authorization lives beside the data rather than being reimplemented in every query path. Auth, Storage and Realtime come with it.
- PWA rather than native: one codebase, no app-store review cycle, instant updates, and a URL we can share.

## Consequences

**Good**

- One language, one repo, one deploy.
- RLS means a missed authorization check in application code is not automatically a data breach.
- Preview deploys per PR make beta testing trivial.
- Free tiers cover development entirely.

**Bad**

- **No HealthKit or Health Connect access.** This is the real cost, and it caps [F-21](../01-product-spec.md#f-21--apple-health--health-connect--p2) until we ship a native shell. Accepted because Strava aggregates most devices anyway.
- iOS PWA support lags: push requires install-to-home-screen, and Background Sync is unavailable, so we need an app-focus sync fallback.
- Vendor concentration on Supabase. Mitigated by it being plain Postgres — the data is portable, and only Auth and Storage would need replacing.
- Server Components add a mental-model cost; the client/server boundary must be deliberate.

## Alternatives considered

| Option                                               | Why not                                                                                                                                                                                                                            |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **React Native / Expo**                              | Best device access and the only path to HealthKit, but app-store friction, a heavier build, and a worse "just open the link" beta story. Would be the right call if wearables were the core of the product; they're an accelerant. |
| **Vite SPA + Supabase**                              | Simpler mental model and easier offline, but no server-side rendering (worse first paint on mobile) and no place for webhooks without a second service.                                                                            |
| **Next.js + custom backend (Nest/Fastify + Prisma)** | More control, far more code, and we'd be hand-writing the authorization layer RLS gives us for free.                                                                                                                               |
| **Firebase**                                         | Great offline story, but the document model fits this relational domain badly, and querying "sessions in this date range grouped by week" would be painful.                                                                        |

## Revisit if

HealthKit becomes a genuine blocker for users, or iOS PWA limitations start costing us retention. The fallback is wrapping the existing app in Capacitor, which does not require a rewrite — that optionality is part of why this stack was chosen.
