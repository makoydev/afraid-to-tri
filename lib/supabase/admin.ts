import 'server-only';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { clientEnv, serverEnv } from '@/lib/env';

/**
 * Privileged Supabase client.
 *
 * **This client BYPASSES Row Level Security.** It exists for the few things
 * that legitimately need it: webhook receivers acting on behalf of a user who
 * is not present, scheduled jobs, and account deletion.
 *
 * Rules:
 *   * Never import this from a Client Component. `server-only` makes that a
 *     build error rather than a silent leak.
 *   * Always scope the query by `user_id` yourself — you have just turned off
 *     the safety net that normally does it for you.
 *   * Never return raw rows from here straight to a client.
 */
export function createAdminClient() {
  const { NEXT_PUBLIC_SUPABASE_URL } = clientEnv();
  const { SUPABASE_SECRET_KEY } = serverEnv();

  return createSupabaseClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
