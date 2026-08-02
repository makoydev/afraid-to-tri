# ADR-0004 — Session steps stored as JSONB

**Status:** Accepted · 2026-08-02

## Context

A structured workout is a tree: a session has steps, steps can repeat, repeats contain steps, and each step has a target expressed in whatever unit that discipline uses (time, distance, pool lengths, power range, pace range, HR range, or nothing at all).

Modelling that relationally means a `session_steps` table with a self-referencing parent, an ordering column, a polymorphic target, and recursive queries to read it back. That's a lot of machinery.

The access pattern is one-sided: steps are **always** read as a whole session and **never** queried across sessions. Nothing in the product asks "find every session containing a 4×8 min block".

## Decision

Store steps as a `jsonb` column on `sessions`, validated by a Zod schema at both the application boundary and — via a `check` constraint calling a validation function — at the database boundary.

The TypeScript `Step[]` type in `lib/training/` is the single definition; the Zod schema is derived from it and shared by client and server.

## Consequences

**Good**
- One row read serves the whole workout detail screen and the entire live-workout session. No joins, no recursion.
- Steps serialize to IndexedDB for offline use without any transformation — which matters, because the live workout must run from cache.
- Schema evolution is cheap: adding an optional field to a step doesn't need a migration.
- Templates and generated sessions share one shape.

**Bad**
- No referential integrity on step contents; correctness depends on validation discipline.
- Cannot query inside steps efficiently without a GIN index, which we'd add only if a real need appeared.
- Migrating the step shape means rewriting rows rather than altering a column. Mitigated by versioning the structure (`steps.version`) and handling old shapes on read.

## Alternatives considered

| Option | Why not |
|---|---|
| **Normalized `session_steps` table** | Recursive CTEs and a polymorphic target column, to support a query nobody wants to run. Costs are real; benefits are hypothetical. |
| **A workout DSL stored as text** (à la Zwift `.zwo` or a `4x8min@Z4` mini-language) | Compact and human-editable, but needs a parser, and the parser becomes a source of bugs in the one code path that must never fail mid-session. |
| **Steps only on templates, sessions reference a template + scale factor** | Elegant until the athlete edits one session, or an adaptation shortens a single interval. Sessions need to be independently mutable. |

## Revisit if

We build a workout builder that needs to query across step structures (e.g. "show me every threshold session I've done"), or if analytics start needing per-interval aggregation across sessions. A GIN index buys some headroom before a real migration is needed.
