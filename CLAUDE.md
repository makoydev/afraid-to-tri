# Working in this repo

Conventions for anyone — human or agent — writing code here. Read [docs/](docs/) first; this file only covers _how_ to work, not _what_ to build.

## Current state

Documentation phase. No application code yet. The docs in `docs/` are the specification the build follows — if you're about to write code that contradicts them, update the doc in the same commit, or don't write the code.

## Non-negotiables

These come from the specs and are not up for casual reinterpretation:

1. **`lib/training/` stays pure.** No I/O, no `Date.now()`, no randomness. Current date and seeded RNG are parameters. Lint-enforced. ([ADR-0006](docs/adr/0006-pure-domain-layer.md))
2. **Every generated plan passes `lib/training/safety.ts` before persisting.** A plan that fails the rails is a 500, not a warning.
3. **RLS on every table**, with a test in `tests/rls/` proving a second user can't read or write the first user's rows. This suite is never skipped.
4. **Service-role key never reaches the client.** Only `lib/supabase/admin.ts` may import it.
5. **Every mutation works offline.** If you add a write path with no outbox story, it's incomplete. ([ADR-0002](docs/adr/0002-offline-first-pwa.md))
6. **No jargon without a `JargonChip`.** Every domain term the user sees must be tappable to a glossary definition.
7. **Never colour alone** to convey state. Icon or label, always.
8. **No trademarked metric names** — Load / Intensity Ratio / Fitness / Fatigue / Freshness. ([ADR-0003](docs/adr/0003-generic-load-metric.md))

## Code style

- TypeScript strict. No `any`; use `unknown` and narrow.
- Server Components by default. `'use client'` needs a reason: interactivity, a browser API, or an offline requirement.
- Zod schemas at every boundary, exported from `lib/schemas/`, shared client and server.
- Durations in seconds, distances in metres, pace in seconds-per-unit. Conversion happens in the UI layer only.
- Calendar days are `YYYY-MM-DD` strings, never `Date` objects — the athlete's Tuesday is a Tuesday regardless of timezone.
- Named exports. Default exports only where a framework demands one.
- Files: `kebab-case.ts`. Components: `PascalCase.tsx`. Hooks: `use-thing.ts`.

## Copy

User-facing strings go through `lib/format/` and are externalized. Before writing any, read the tone table in [docs/06-design-system.md § Emotional design](docs/06-design-system.md#emotional-design). The word "failed" does not appear in this product.

## Testing

| Suite  | Command           | Gate                                                                                                 |
| ------ | ----------------- | ---------------------------------------------------------------------------------------------------- |
| Unit   | `pnpm test`       | All of `lib/training/` covered, including property tests                                             |
| RLS    | `pnpm test:rls`   | Runs against an ephemeral database in CI                                                             |
| E2E    | `pnpm test:e2e`   | Must include the offline log-and-sync scenario                                                       |
| Budget | `pnpm lighthouse` | Fails the PR if the perf budget in [docs/05](docs/05-architecture.md#performance-budget) is exceeded |

New training logic without unit tests doesn't merge. Everything else is negotiable.

## Commits

- Micro-commits: one logical change each, committed as soon as it stands on its own.
- Conventional-ish prefixes: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
- Imperative mood, lowercase after the prefix, no trailing period.
- **No AI co-author trailers.**
- Never commit or push unless asked.

## Migrations

Supabase CLI, one file per change, in `supabase/migrations/`. Forward-only and safe on a live table: add nullable → backfill → constrain. Enum values may be added, never removed or reordered. Migrations run before the deploy and must be compatible with the currently-deployed code.

## Where things live

See the tree in [docs/05-architecture.md § Directory structure](docs/05-architecture.md#directory-structure). The short version: domain logic in `lib/training/`, UI primitives in `components/ui/`, content in `content/` as MDX, everything user-facing in `app/`.
