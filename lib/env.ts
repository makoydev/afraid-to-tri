import { z } from 'zod';

/**
 * Environment variables, validated once at boot.
 *
 * This is the only module permitted to read `process.env` (enforced by lint),
 * so a missing or malformed variable fails loudly here rather than as a
 * confusing runtime error three screens into the app.
 *
 * Client and server variables are separated deliberately: anything in
 * `clientEnv` is bundled into the browser and must be safe to publish.
 */

/* ----------------------------------------------------------------- client */

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  /**
   * Supabase's publishable key (`sb_publishable_…`, formerly the anon key).
   * Public by design — it is shipped to every browser and protected by RLS.
   */
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
});

export type ClientEnv = z.infer<typeof clientSchema>;

/**
 * Next inlines `process.env.NEXT_PUBLIC_*` at build time only when referenced
 * literally, so these cannot be looked up dynamically.
 */
function readClientEnv(): ClientEnv {
  const parsed = clientSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid public environment variables:\n${formatIssues(parsed.error)}\n` +
        'Copy .env.example to .env.local and fill it in.',
    );
  }
  return parsed.data;
}

let cachedClientEnv: ClientEnv | undefined;

export function clientEnv(): ClientEnv {
  cachedClientEnv ??= readClientEnv();
  return cachedClientEnv;
}

/* ----------------------------------------------------------------- server */

const serverSchema = z.object({
  /**
   * Supabase's secret key (`sb_secret_…`, formerly the service-role key).
   * BYPASSES ROW LEVEL SECURITY. Server-only, never logged, never bundled.
   */
  SUPABASE_SECRET_KEY: z.string().min(20),
  CRON_SECRET: z.string().min(16).optional(),
  SENTRY_DSN: z.string().url().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cachedServerEnv: ServerEnv | undefined;

/**
 * Server-only variables. Throws if called from the browser, so a bad import
 * fails at once instead of quietly shipping a secret to the client.
 */
export function serverEnv(): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() was called in the browser. Server secrets must never be bundled.');
  }
  if (cachedServerEnv) return cachedServerEnv;

  const parsed = serverSchema.safeParse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    SENTRY_DSN: process.env.SENTRY_DSN,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid server environment variables:\n${formatIssues(parsed.error)}\n` +
        'These belong in .env.local (never in the repo).',
    );
  }
  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}

function formatIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`).join('\n');
}

/** Test seam: clears the memoised values so a test can vary the environment. */
export function resetEnvCacheForTests(): void {
  cachedClientEnv = undefined;
  cachedServerEnv = undefined;
}
