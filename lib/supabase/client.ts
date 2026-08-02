'use client';

import { createBrowserClient } from '@supabase/ssr';
import { clientEnv } from '@/lib/env';

/**
 * Supabase client for the browser.
 *
 * Uses the publishable key, so every query is subject to Row Level Security.
 * This is the only Supabase client that may be imported from a Client
 * Component — see lib/supabase/admin.ts for the privileged one.
 */
export function createClient() {
  const env = clientEnv();
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
