# Architecture Decision Records

Short records of decisions that were expensive to make and would be expensive to reverse. Each one captures the context and the trade-off, so that a future reader can tell whether the reasoning still holds.

Format: **Context → Decision → Consequences → Alternatives considered.** Status is `Proposed`, `Accepted`, `Superseded by ADR-xxxx`, or `Deprecated`.

Write a new ADR when a decision (a) affects more than one part of the system, (b) is hard to undo, or (c) will otherwise be re-litigated in three months by someone who wasn't there.

| #                                       | Title                                     | Status   |
| --------------------------------------- | ----------------------------------------- | -------- |
| [0001](0001-nextjs-supabase-pwa.md)     | Next.js + Supabase + PWA                  | Accepted |
| [0002](0002-offline-first-pwa.md)       | Offline-first with a client outbox        | Accepted |
| [0003](0003-generic-load-metric.md)     | Generic load metric names                 | Accepted |
| [0004](0004-jsonb-for-session-steps.md) | Session steps stored as JSONB             | Accepted |
| [0005](0005-rpe-first-zones.md)         | RPE by default, numeric zones unlocked    | Accepted |
| [0006](0006-pure-domain-layer.md)       | Training domain as a pure, I/O-free layer | Accepted |
