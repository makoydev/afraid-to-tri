# ADR-0006 — Training domain as a pure, I/O-free layer

**Status:** Accepted · 2026-08-02

## Context

The plan generator, load model, adaptation engine and safety validator are the product. If they're wrong, nothing else matters — a bad plan can injure someone, and an unexplainable plan destroys trust.

They're also the part most likely to change: coaching heuristics get tuned, and Phase 3 replaces the rule-based adaptation with something learned.

The usual failure mode is that this logic ends up smeared across route handlers, React components and database queries, at which point it can't be tested in isolation, can't be reasoned about, and can't be replaced.

## Decision

`lib/training/` is a **pure functional core**. It:

- Takes plain objects, returns plain objects.
- Performs no I/O: no database, no fetch, no `Date.now()`, no randomness. The current date is a parameter. Any randomness is passed in as a seeded generator.
- Imports nothing from `app/`, `lib/supabase/`, or any module that touches the network.

Enforced by an ESLint `no-restricted-imports` rule on the directory, checked in CI.

Corollaries:

1. **Every generated plan passes through `lib/training/safety.ts` before it is persisted or returned.** A plan that fails the rails is a 500, not a warning.
2. `plans.generator_input` and `plans.generator_version` store the exact input and code version, so **any historical plan can be regenerated bit-for-bit**. This is what makes "why did it give me this?" answerable and what lets us regression-test generator changes against real user inputs.
3. Because the layer is deterministic, property-based testing over randomized athlete profiles is possible — and is a required part of the suite.

## Consequences

**Good**
- The riskiest code is the most testable code, with no mocks anywhere.
- Fast tests: thousands of generated plans validate in seconds.
- The generator can run identically on the server (route handler) or the client (offline re-plan), because it has no environment dependencies.
- Phase 3's adaptive model can be swapped in behind the same function signatures.

**Bad**
- Some awkwardness: callers must fetch everything the domain needs up front and pass it in, which makes some signatures wide.
- Date handling requires discipline — a stray `new Date()` silently breaks determinism, which is why it's lint-enforced rather than a convention.
- Duplication risk between what the domain computes and what SQL could aggregate. Resolved in the domain's favour: correctness and testability beat a marginally cheaper query.

## Alternatives considered

- **Logic in route handlers.** Fastest to write, impossible to test well, and it makes the offline re-plan story impossible.
- **Logic in Postgres functions.** Excellent for aggregate queries like `daily_metrics`, terrible for the branching, constraint-satisfying logic of plan generation. We use SQL for aggregation and TypeScript for decisions.
- **A separate service.** Deployment and latency cost with no benefit at this scale; a module boundary is enough discipline.
