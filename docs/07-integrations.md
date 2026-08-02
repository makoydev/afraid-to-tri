# 07 — Integrations

Goal: **the athlete never types in a workout they already recorded.** Everything here is an input pipeline into `activities`, which is then matched to planned `sessions`.

> **Verify before building.** Third-party API details (scopes, rate limits, endpoint shapes) change. Everything below reflects the documented behaviour at time of writing and must be re-checked against the provider's current docs before implementation.

---

## Provider comparison

|                               | Strava          | Garmin Connect               | Apple Health    | Health Connect  |
| ----------------------------- | --------------- | ---------------------------- | --------------- | --------------- |
| Phase                         | 1               | 2                            | 2               | 2               |
| Approval needed               | Self-serve      | **Partner program approval** | —               | —               |
| Web-accessible                | ✅              | ✅                           | ❌ native only  | ❌ native only  |
| Push in (new activities)      | Webhooks        | Push service                 | Native observer | Native observer |
| Push out (workouts to device) | ❌              | ✅ Training API              | ✅              | Limited         |
| Wellness (sleep, HRV, RHR)    | ❌              | ✅                           | ✅              | ✅              |
| Covers most users             | ✅ (aggregator) | Garmin owners only           | iPhone owners   | Android         |

**Strava first** because it aggregates almost every device — a Garmin, Wahoo, Coros, or Apple Watch user very likely already syncs to Strava. One integration covers the majority of the addressable users.

**Apple Health and Health Connect cannot be accessed from a PWA.** They require native code. That's a real constraint on the [F-21](01-product-spec.md#f-21--apple-health--health-connect--p2) scope: it depends on shipping a thin native shell (Capacitor) or a companion app, and that decision should be made deliberately in Phase 2 rather than assumed. Until then, Apple Watch users are served via Strava.

---

## Strava (F-11)

### OAuth

- Authorization: `https://www.strava.com/oauth/authorize`
- Scopes requested: `read`, `activity:read_all`. We do **not** request write scopes — we never post to a user's Strava.
- Exchange and refresh at `https://www.strava.com/oauth/token`. Access tokens are short-lived (~6 h); refresh tokens are long-lived.
- Tokens stored in `integrations`, encrypted, server-side only. A refresh job runs hourly for tokens expiring within 24 h.

```
GET  /api/integrations/strava/connect     → redirect to Strava
GET  /api/integrations/strava/callback    → exchange code, create subscription, kick off backfill
POST /api/integrations/strava/disconnect  → deauthorize with Strava, delete subscription + tokens
```

### Webhooks

One subscription per application (not per user); Strava posts every athlete event to a single callback.

- `GET /api/webhooks/strava` — subscription validation. Echo `hub.challenge` when `hub.verify_token` matches `STRAVA_WEBHOOK_VERIFY_TOKEN`.
- `POST /api/webhooks/strava` — event delivery: `{ object_type, object_id, aspect_type, owner_id, subscription_id, event_time, updates }`.

**Handler rules**

1. Verify `subscription_id`. Reject anything else.
2. **Respond 200 within 2 seconds**, always. Enqueue the work; never process inline. Strava retries and then disables subscriptions that are slow or failing.
3. Map `owner_id` → our user via `integrations.external_user_id`. Unknown owner → 200 and drop (they may have disconnected).
4. `aspect_type: create` → fetch the activity, insert into `activities`, run matching.
5. `aspect_type: update` → update the row; if the type changed, re-run matching.
6. `aspect_type: delete` → soft-detach from any session, keep the session log (the athlete still did the training).
7. `object_type: athlete` with `authorized: false` → mark the integration revoked, stop syncing.

### Rate limits

Strava enforces per-application limits on both a 15-minute and a daily window (a few hundred and a few thousand requests respectively, depending on the app's tier — check current docs). Handling:

- A single token-bucket limiter shared across the whole app, backed by Redis or a Postgres advisory-lock counter.
- Backfill jobs run at low priority and yield to webhook-triggered fetches.
- Activity **streams** (HR/pace over time) are fetched lazily — only when the athlete opens that session's detail — and cached in Storage. Streams are the most expensive call and the least often needed.
- On 429: exponential backoff with jitter, respecting the limit-reset headers. Never hammer.

### Backfill

On first connect, import the last 30 days. Used to seed `daily_metrics` so the Fitness/Fatigue chart has history on day one rather than after three weeks.

- Paginated, 30 activities per page, run as a background job.
- Never blocks the UI — the connect screen shows progress and the user can leave.
- Optional deeper backfill (up to 12 months) offered from settings for athletes who want their full history.

### Data mapping

| Strava                                     | Ours                                            |
| ------------------------------------------ | ----------------------------------------------- |
| `id`                                       | `activities.external_id`                        |
| `type` / `sport_type`                      | `discipline` (see table below)                  |
| `start_date`                               | `started_at`; `start_date_local` → `local_date` |
| `elapsed_time` / `moving_time`             | `duration_sec` / `moving_sec`                   |
| `distance`                                 | `distance_m`                                    |
| `average_heartrate` / `max_heartrate`      | `avg_hr` / `max_hr`                             |
| `average_watts` / `weighted_average_watts` | `avg_power` / `weighted_power`                  |
| `total_elevation_gain`                     | `elevation_m`                                   |
| whole payload                              | `raw`                                           |

Sport-type mapping: `Swim` → swim · `Ride`/`VirtualRide`/`EBikeRide`/`GravelRide`/`MountainBikeRide` → bike · `Run`/`TrailRun`/`VirtualRun` → run · `WeightTraining`/`Workout`/`Crossfit` → strength · `Walk`/`Hike`/`Yoga` → imported but not matched to sessions. Anything unrecognized is imported as `other` and never auto-matched.

---

## Activity matching

The logic that decides whether an incoming activity _is_ the planned session. Deliberately conservative: a wrong auto-match is more annoying than a question.

```ts
function scoreMatch(activity: Activity, session: Session): number {
  if (activity.discipline !== session.discipline) return 0;

  const dayDelta = Math.abs(daysBetween(activity.localDate, session.date));
  if (dayDelta > 1) return 0;

  let score = 0;
  score += dayDelta === 0 ? 50 : 25;

  // duration proximity, up to 30 points
  const ratio = activity.durationSec / session.plannedSeconds;
  score += ratio >= 0.7 && ratio <= 1.4 ? 30 * (1 - Math.abs(1 - ratio)) : 0;

  // distance proximity, up to 20 points (when both known)
  if (activity.distanceM && session.plannedMeters) {
    const dRatio = activity.distanceM / session.plannedMeters;
    score += dRatio >= 0.7 && dRatio <= 1.4 ? 20 * (1 - Math.abs(1 - dRatio)) : 0;
  }

  return score; // 0–100
}
```

| Score | Action                                                                |
| ----- | --------------------------------------------------------------------- |
| ≥ 75  | Auto-complete the session. Notify: "Your Tuesday ride is logged ✓"    |
| 45–74 | Ask: "Was this your Tuesday ride?" — one tap yes/no                   |
| < 45  | Log as an extra session outside the plan; it still counts toward load |

**Special cases**

- **Bricks** arrive as two Strava activities (a ride and a run) close together. If both match a `brick` session's legs within 30 minutes of each other, match them as a pair.
- **Multiple candidates** on the same day: pick the highest score, ask if the top two are within 10 points.
- **One activity, two sessions** (a double day): an activity can only ever match one session.
- **Manual log then import**: if the athlete already logged manually and a matching activity arrives within 24 h, enrich the existing log with the device data rather than creating a duplicate. Athlete-entered RPE and notes are never overwritten.

### Idempotency

`unique (user_id, source, external_id)` on `activities` makes duplicate webhook delivery a no-op. Webhook handlers are written to be safely re-runnable — Strava _will_ deliver the same event twice.

---

## Garmin Connect (F-20)

Requires acceptance into Garmin's developer program before any implementation work; **apply early**, approval is not instant.

Two capabilities we want:

1. **Activity + wellness in** — completed activities, plus resting HR, HRV, sleep and body battery, which feed the readiness check-in ([F-23](01-product-spec.md#f-23--readiness-check-in--p2)). Delivered by Garmin's push service (they POST to us) rather than polling.
2. **Workouts out** — push tomorrow's structured session to the watch, so the athlete gets the interval prompts on their wrist instead of their phone. This is the single highest-value integration feature for the improver persona, and it changes the live-workout story completely for Garmin owners.

**Mapping our sessions to Garmin workouts:** our `Step[]` maps onto Garmin's workout step model (duration/distance-based steps with target ranges, repeat groups). Targets translate as: power range for bike (if FTP known), pace range for run, HR range as fallback, and open (no target) when the athlete is still on RPE. Swim sets map to pool-length-based steps.

**Sync policy:** push the next 7 days on connect, then push on plan change. Delete-and-replace rather than diff — simpler and Garmin's workout API tolerates it. Never push more than 14 days out.

---

## Apple Health / Health Connect (F-21)

Blocked on the native-shell decision above. When built:

- **Read only.** Workouts, resting HR, HRV (SDNN on iOS, RMSSD on Android), sleep, and body mass.
- Permission requested contextually and per-type — never a wall of toggles at first launch.
- Deduplicate against Strava: an Apple Watch run reaches us twice (once via Health, once via Strava). Match on start time within 2 minutes and duration within 5%; prefer the source with richer data.
- Data stays on-device where possible; only aggregates are synced. Health data is never sent to any third party, ever.

---

## Weather (F-24)

- Provider: Open-Meteo (no key, generous free tier) or OpenWeather.
- Fetched for the athlete's coarse location (city-level, never precise coordinates) for outdoor sessions in the next 48 h.
- Surfaces: heat guidance (> 28 °C), cold/ice warnings, wind for bike sessions, lightning → move indoors.
- Cached per city-day; one call serves every user in that city.

---

## Race data (Phase 2+)

No good universal API exists for race calendars. Approach: a curated seed list of major series (Ironman, Challenge, national federation calendars) plus user-entered custom races. `races` already supports fully custom entries, so this is an enhancement to onboarding convenience, never a dependency.

---

## Failure handling

Integrations fail constantly in production. The rules:

| Failure                      | Behaviour                                                                                                 |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| Token expired                | Refresh silently. If refresh fails, mark `status = 'expired'` and show a one-tap reconnect card on Today. |
| Provider 5xx                 | Retry with backoff (3 attempts), then park the event in a dead-letter table for manual replay.            |
| Rate limited                 | Back off, queue, resume. Never drop the event.                                                            |
| Webhook signature invalid    | 200 (so the provider doesn't retry) + log + alert. Never process.                                         |
| User revoked at the provider | Detect via the revocation event or a failed refresh; mark revoked, stop syncing, keep imported data.      |
| Malformed payload            | Store `raw`, mark the row `needs_review`, continue. Never crash the handler on one bad activity.          |

**Invariant:** an integration failure must never break the core product. If Strava is down, the athlete can still see their plan, run a session, and log it by hand. Every integration is an accelerant, never a dependency.
