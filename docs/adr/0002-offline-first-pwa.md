# ADR-0002 — Offline-first with a client outbox

**Status:** Accepted · 2026-08-02

## Context

Triathletes train in places with no signal: swimming pools (often underground, always phone-hostile), basements on turbo trainers, trails, and open water. A training app that requires connectivity to record a session is broken during the exact moments it's supposed to be useful.

Worse, race venues have terrible signal — usually thousands of people in a field — which is when the race-day toolkit matters most.

The failure mode we must eliminate: **an athlete completes a session and the app loses it.** That destroys trust permanently and is unrecoverable — they can't do the session again.

## Decision

Offline-first, not offline-tolerant. Specifically:

1. **Reads** go through TanStack Query with an IndexedDB-persisted cache. The cache is the source of truth for the UI; the network updates it.
2. **Writes** go to a client-side outbox in IndexedDB before anything else. The UI updates optimistically and never blocks on the network.
3. Each mutation carries a client-generated `clientId` (UUID). The server upserts on `(user_id, client_id)`, so replay is idempotent.
4. Background Sync flushes the outbox, with an app-focus fallback for iOS.
5. The **live workout runs with zero network calls.** Session data and audio are cached before the Start button enables.
6. Conflict resolution is explicit per data type: session logs are client-wins, plan structure is server-wins, profile fields are last-write-wins per field, checklists merge by item.
7. A mutation that permanently fails is **parked and surfaced**, never silently dropped.

## Consequences

**Good**
- The app works in a pool, a basement, and at a race start.
- The UI is instant, because it never waits for a round trip.
- Duplicate delivery — from retries, double taps, or a flaky connection — is harmless.

**Bad**
- Significant complexity: every mutation path needs an offline story, and "just call the API" is never the answer.
- Cache invalidation becomes a real design problem rather than an afterthought.
- Testing is harder; offline scenarios must be in the e2e suite or they will regress.
- Storage quota must be managed — cached audio and activity streams add up, so eviction policy is required.
- `POST /api/sessions/sync` must accept its payload shape more or less forever, since a client can replay mutations from a version we shipped weeks ago.

## Alternatives considered

| Option | Why not |
|---|---|
| **Online-only with a friendly error** | Fails at exactly the moments the app exists for. Non-starter. |
| **Offline reads, online writes** | Half a solution. The write is the part that hurts to lose. |
| **A sync framework (RxDB, WatermelonDB, ElectricSQL)** | Powerful, but heavy for our bundle budget and opinionated in ways that fight Supabase. Our mutation set is small and well-understood; hand-rolling the outbox is a few hundred lines we fully control. |
| **CRDTs** | Correct in general, over-engineered here. Conflicts are rare (one user, one device at a time in practice) and the per-type rules above resolve them unambiguously. |

## Revisit if

Multi-device concurrent editing becomes common, or the hand-rolled outbox starts accumulating edge-case bugs. At that point a real sync engine earns its weight.
