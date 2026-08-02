import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { clientEnv, serverEnv, resetEnvCacheForTests } from './env';

const ORIGINAL = { ...process.env };

beforeEach(() => {
  resetEnvCacheForTests();
});

afterEach(() => {
  process.env = { ...ORIGINAL };
  resetEnvCacheForTests();
});

describe('clientEnv', () => {
  it('returns the public variables when they are valid', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_abcdefghijklmnop';

    const env = clientEnv();
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://example.supabase.co');
    expect(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toContain('sb_publishable_');
  });

  it('fails loudly when a variable is missing, naming the culprit', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_abcdefghijklmnop';

    expect(() => clientEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it('rejects a url that is not a url, rather than failing later at request time', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'not-a-url';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_abcdefghijklmnop';

    expect(() => clientEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it('rejects an obviously truncated key', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'short';

    expect(() => clientEnv()).toThrow(/PUBLISHABLE_KEY/);
  });

  it('points the reader at .env.example instead of just complaining', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(() => clientEnv()).toThrow(/\.env\.example/);
  });

  it('reads the environment once and memoises it', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_abcdefghijklmnop';

    const first = clientEnv();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://changed.supabase.co';
    expect(clientEnv()).toBe(first);
  });
});

describe('serverEnv', () => {
  it('returns the server variables when they are valid', () => {
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_abcdefghijklmnopqrst';
    expect(serverEnv().SUPABASE_SECRET_KEY).toContain('sb_secret_');
  });

  it('treats the optional variables as optional', () => {
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_abcdefghijklmnopqrst';
    delete process.env.CRON_SECRET;
    delete process.env.SENTRY_DSN;
    expect(() => serverEnv()).not.toThrow();
  });

  it('refuses to run in the browser, so a secret can never be bundled', () => {
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_abcdefghijklmnopqrst';
    const globalWithWindow = globalThis as { window?: unknown };
    globalWithWindow.window = {};
    try {
      expect(() => serverEnv()).toThrow(/browser/i);
    } finally {
      delete globalWithWindow.window;
    }
  });

  it('fails when the secret key is missing', () => {
    delete process.env.SUPABASE_SECRET_KEY;
    expect(() => serverEnv()).toThrow(/SUPABASE_SECRET_KEY/);
  });
});
