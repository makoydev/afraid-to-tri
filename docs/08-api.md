# 08 — API Contracts

Most reads go **straight to Supabase** from Server Components and the client, protected by RLS. Route handlers exist only where we need something Postgres can't give us: heavy computation, secrets, third-party callbacks, or batched idempotent writes.

## Rules

- Everything under `/api/*` is a Next.js route handler.
- Request and response bodies are validated with Zod schemas exported from `lib/schemas/`, shared by client and server.
- Dates in payloads are ISO 8601 strings. Calendar days are `YYYY-MM-DD` with no timezone.
- Every mutation accepts a `clientId` for idempotency.
- Errors use one shape, always.

```ts
type ApiError = {
  error: {
    code: string; // machine-readable, stable
    message: string; // human-readable, safe to show
    details?: unknown; // Zod issues, field errors
    retryable: boolean;
  };
};
```

| Status | When                                                                   |
| ------ | ---------------------------------------------------------------------- |
| 400    | Validation failure                                                     |
| 401    | No/invalid session                                                     |
| 403    | RLS or scope denial                                                    |
| 404    | Not found, or not visible to this user (indistinguishable, on purpose) |
| 409    | Conflict (e.g. an active plan already exists)                          |
| 422    | Semantically invalid — the big one is `PLAN_INFEASIBLE`                |
| 429    | Rate limited; `Retry-After` set                                        |
| 500    | Unhandled; logged with a request id returned to the client             |

---

## Direct Supabase access (no route handler)

| Operation                                  | Access                            |
| ------------------------------------------ | --------------------------------- |
| Read today's session, week, calendar month | `select` on `sessions`            |
| Read plan and weeks                        | `select` on `plans`, `plan_weeks` |
| Read metrics series                        | `select` on `daily_metrics`       |
| Read/update profile                        | `select`/`update` on `profiles`   |
| Checklist toggles                          | `update` on `checklists`          |
| Module progress                            | `upsert` on `module_progress`     |

These need no server round-trip and no bespoke code. RLS is the authorization layer.

---

## `POST /api/plan/generate`

Generates a plan. The most expensive and most important endpoint in the app.

```ts
// request
{
  goal: {
    mode: 'race' | 'fitness' | 'finish_only';
    raceId?: string;
    race?: { name: string; date: string; distance: RaceDistance; waterType?: WaterType };
    targetHoursPerWeek?: number;
  };
  profileOverrides?: Partial<AthleteProfile>;  // preview-time tweaks, not persisted
  dryRun?: boolean;                             // true during onboarding preview
}

// 200
{
  plan: {
    id: string | null;                          // null when dryRun
    startDate: string; endDate: string;
    weeks: Array<{
      weekIndex: number; startDate: string; phase: PlanPhase;
      isRecovery: boolean; targetLoad: number; targetSeconds: number; focus: string;
      sessions: SessionSummary[];
    }>;
    summary: {
      totalWeeks: number; sessionsPerWeek: number;
      startHoursPerWeek: number; peakHoursPerWeek: number;
      predictedTime?: { lowSec: number; highSec: number; confidence: 'low'|'medium'|'high' };
    };
  };
  warnings: Array<{ code: string; message: string }>;
}

// 422 — infeasible
{
  error: {
    code: 'PLAN_INFEASIBLE',
    message: "That's 8 weeks to a full Ironman. I can't build you a plan that gets you there safely.",
    retryable: false,
    details: {
      reason: 'runway_too_short',
      minimumWeeks: 24,
      availableWeeks: 8,
      options: [
        { type: 'shorter_distance', distance: 'olympic', label: 'Do the Olympic instead' },
        { type: 'later_date', suggestedDate: '2027-04-18', label: 'Move to April' },
        { type: 'finish_only', label: 'Train to finish, not to race' }
      ]
    }
  }
}
```

- Rate limited to 10/hour per user (generation is CPU-bound).
- `dryRun: true` returns the plan without persisting — this is what the onboarding preview uses, so a user who abandons doesn't leave orphan plans.
- Persisting a plan sets any previous active plan to `abandoned` (the `one_active_plan` unique index enforces this).
- Stores `generator_version` and `generator_input` for reproducibility.
- **Every generated plan is run through `lib/training/safety.ts` before it is returned.** A plan that fails validation is a 500, not a warning — it's a bug, and shipping a plan that breaks a safety rail is worse than an error page.

---

## `POST /api/sessions/sync`

Offline mutation replay. The heart of the offline story.

```ts
// request
{
  mutations: Array<{
    clientId: string;              // UUID, idempotency key
    clientUpdatedAt: string;
    type: 'log' | 'skip' | 'move' | 'note' | 'create' | 'delete';
    sessionId?: string;            // absent for 'create'
    payload: Record<string, unknown>;
  }>;
}

// 200 — always 200 if the request was well-formed; per-mutation results inside
{
  results: Array<{
    clientId: string;
    status: 'applied' | 'duplicate' | 'conflict' | 'rejected';
    session?: Session;             // reconciled server state
    error?: ApiError['error'];
  }>;
  adjustments: PlanAdjustment[];   // anything the adaptation engine did as a result
  serverTime: string;
}
```

- Batch limit 50 mutations. Larger queues are chunked by the client.
- Applied in `clientUpdatedAt` order within the batch.
- `duplicate` (already-seen `clientId`) is a **success**, not an error — the client clears it from the outbox.
- `rejected` is terminal: the client stops retrying and surfaces it to the user.
- Adaptation runs once at the end of the batch, not per mutation.

---

## `POST /api/plan/adjust`

Manual plan edits from the calendar. Server-side because moving a session revalidates weekly load and constraints.

```ts
// request
{ action: 'move' | 'swap' | 'skip' | 'add' | 'remove' | 'replan_from_today',
  sessionId?: string, targetDate?: string, withSessionId?: string,
  reason?: SkipReason, session?: NewSessionInput }

// 200
{ affected: Session[], warnings: Array<{ code, message, fix?: { label, action } }>, weekLoad: { before, after } }
```

Warnings are advisory — a user may put two hard days back to back if they insist. Each warning may carry a one-tap `fix`.

---

## `POST /api/plan/adjustments/:id/undo`

Reverts an automatic adaptation from its stored `snapshot`. Returns the restored sessions. Undo is available for 7 days.

---

## `POST /api/tests/:kind/submit`

```ts
// request  { date, rawValue, sessionId? }   // watts, sec/km, or sec/100m
// 200      { derived: { ftp?, lthr?, thresholdPace?, cssPace?, zones }, changed: { zones: boolean }, sessionsUpdated: number }
```

Recomputes zones, re-materializes future session targets, writes a `plan_adjustment` with rule `A10`.

---

## Integration routes

```
GET  /api/integrations/:provider/connect
GET  /api/integrations/:provider/callback
POST /api/integrations/:provider/disconnect
POST /api/integrations/:provider/backfill      { days: number }
GET  /api/integrations                          → status list, never tokens
```

```
GET  /api/webhooks/strava      # subscription validation
POST /api/webhooks/strava      # event delivery — 200 within 2s, always
POST /api/webhooks/garmin
```

Webhook handlers: verify → enqueue → 200. No business logic inline.

---

## `POST /api/cron/nightly`

Bearer-authenticated with `CRON_SECRET`. Processes users in timezone buckets.

```ts
// request { timezoneBucket: string, cursor?: string, limit?: number }
// 200     { processed: number, adjustments: number, notificationsQueued: number, nextCursor: string | null }
```

Idempotent and resumable — a timeout re-enters at `nextCursor`, so a slow night never leaves users un-adapted.

---

## `POST /api/notifications/subscribe` · `DELETE /api/notifications/subscribe`

Web Push subscription management. Stores endpoint + keys against the user. Categories and quiet hours live on `profiles`.

---

## `GET /api/me/export`

Kicks off an export job; returns `{ jobId }`. `GET /api/me/export/:jobId` returns `{ status, url? }` with a signed URL valid for 24 h. Contains every row owned by the user plus any stored activity files.

---

## `DELETE /api/me`

Requires re-authentication. Revokes all integration tokens with their providers **before** deleting anything, marks the account for deletion, and hard-deletes within 30 days. Returns `{ scheduledDeletionAt }`.

---

## Realtime (Phase 4)

Supabase Realtime channels, RLS-filtered:

| Channel                 | Payload                                                                        |
| ----------------------- | ------------------------------------------------------------------------------ |
| `user:{id}:sessions`    | Session updated (e.g. auto-completed by a Strava import while the app is open) |
| `user:{id}:adjustments` | New plan adjustment                                                            |
| `coach:{id}:roster`     | Athlete logged a session                                                       |
| `session:{id}:comments` | New comment                                                                    |

---

## Rate limits

| Endpoint                       | Limit                          |
| ------------------------------ | ------------------------------ |
| `/api/plan/generate`           | 10 / hour / user               |
| `/api/sessions/sync`           | 60 / hour / user               |
| `/api/integrations/*/backfill` | 3 / day / user                 |
| Webhooks                       | 1000 / min / provider (global) |
| Auth                           | 5 / 15 min / IP                |

---

## Versioning

No public API in Phase 1–3, so no version prefix. If one is ever exposed, it goes under `/api/v1/*` and the internal routes stay where they are. Breaking changes to internal contracts are safe because client and server deploy together — but the **offline outbox is the exception**: a client can be days out of date and still replaying old mutations. `POST /api/sessions/sync` must therefore accept its current payload shape indefinitely, and any change to it must be additive.
