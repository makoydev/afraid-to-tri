import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { clientEnv } from '@/lib/env';

type CookieStore = Awaited<ReturnType<typeof cookies>>;
/**
 * The object form Next's own cookie store accepts, derived rather than
 * restated. `set` is overloaded, so the first parameter is `string | Cookie`;
 * we want the object arm.
 */
type NextCookieInit = Extract<Parameters<CookieStore['set']>[0], object>;

/**
 * Exactly the shape `@supabase/ssr` declares for `setAll`. It has to match, or
 * TypeScript silently resolves `createServerClient` to its deprecated
 * get/set/remove overload instead.
 */
interface SupabaseCookie {
  name: string;
  value: string;
  options: CookieOptions;
}

/**
 * Supabase client for Server Components, Server Actions and route handlers.
 *
 * Still uses the publishable key, so RLS applies exactly as it does in the
 * browser — the difference is only that the session comes from cookies.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const env = clientEnv();

  /*
   * `createServerClient` has two overloads, and the deprecated
   * get/set/remove one is declared first. We pass getAll/setAll, so `tsc`
   * resolves the modern overload and typecheck is clean; typescript-eslint
   * attributes the @deprecated tag from the first declaration regardless.
   * Remove this once the deprecated overload is dropped upstream.
   */
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: SupabaseCookie[]) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            // @supabase/ssr and Next describe cookie options with compatible
            // but not identical types (`sameSite` accepts a boolean in one).
            // This is the single boundary cast; both sides stay typed.
            const init: NextCookieInit = { name, value, ...(options as object) };
            cookieStore.set(init);
          }
        } catch {
          // Server Components cannot set cookies. Middleware refreshes the
          // session instead, so this is safe to ignore here.
        }
      },
    },
  });
}
