/**
 * Row Level Security suite.
 *
 * Proves that one athlete cannot read or write another's data. This is the one
 * suite that is never skipped — it is the difference between a bug and a health
 * data breach.
 *
 * Runs against a plain Postgres instance using the auth shim in bootstrap.sql,
 * so it needs no Supabase stack. Point it at a throwaway database:
 *
 *     DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres pnpm test:rls
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const BOOTSTRAP = join(process.cwd(), 'tests', 'rls', 'bootstrap.sql');

interface Result {
  name: string;
  ok: boolean;
  detail?: string;
}

const results: Result[] = [];

function record(name: string, ok: boolean, detail?: string): void {
  results.push(detail === undefined ? { name, ok } : { name, ok, detail });
  const mark = ok ? '  PASS  ' : '! FAIL  ';
  console.log(`${mark}${name}${detail && !ok ? `\n          ${detail}` : ''}`);
}

/**
 * Runs a probe inside a savepoint so a rejected statement does not abort the
 * surrounding transaction and cascade into every later assertion.
 */
async function probe(
  client: Client,
  sql: string,
  params: unknown[],
): Promise<{ rows: number } | { error: string }> {
  await client.query('savepoint probe');
  try {
    const res = await client.query(sql, params);
    await client.query('release savepoint probe');
    return { rows: res.rowCount ?? 0 };
  } catch (error) {
    await client.query('rollback to savepoint probe');
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/** Asserts a statement is rejected or returns nothing — either is isolation. */
async function expectNoAccess(
  client: Client,
  name: string,
  sql: string,
  params: unknown[] = [],
): Promise<void> {
  const result = await probe(client, sql, params);
  if ('error' in result) {
    // A hard rejection is the strongest possible pass.
    record(name, true);
    return;
  }
  record(name, result.rows === 0, `${String(result.rows)} row(s) were visible or written`);
}

async function expectAccess(
  client: Client,
  name: string,
  sql: string,
  params: unknown[] = [],
): Promise<void> {
  const result = await probe(client, sql, params);
  if ('error' in result) {
    record(name, false, result.error);
    return;
  }
  record(name, result.rows > 0, 'expected at least one row, got none');
}

/** Runs `work` with the connection acting as the given athlete. */
async function asUser<T>(client: Client, userId: string, work: () => Promise<T>): Promise<T> {
  await client.query('begin');
  await client.query("select set_config('role', 'authenticated', true)");
  await client.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: 'authenticated' }),
  ]);
  try {
    return await work();
  } finally {
    await client.query('rollback');
  }
}

async function main(): Promise<void> {
  if (!DATABASE_URL) {
    console.log(
      'DATABASE_URL is not set — skipping the RLS suite.\n' +
        'Start a throwaway Postgres and re-run, e.g.\n' +
        '  docker run --rm -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16\n' +
        '  DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres pnpm test:rls',
    );
    process.exit(0);
  }

  const admin = new Client({ connectionString: DATABASE_URL });
  await admin.connect();

  console.log('--- applying schema ---');
  await admin.query('drop schema if exists public cascade; create schema public;');
  await admin.query('drop schema if exists auth cascade;');
  await admin.query(await readFile(BOOTSTRAP, 'utf8'));

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    await admin.query(await readFile(join(MIGRATIONS_DIR, file), 'utf8'));
    console.log(`  applied ${file}`);
  }

  // Two athletes. Alice owns data; Bob must never see it.
  const { rows: users } = await admin.query<{ id: string }>(
    `insert into auth.users (email) values ('alice@example.test'), ('bob@example.test')
     returning id`,
  );
  const alice = users[0]!.id;
  const bob = users[1]!.id;

  // Seed Alice's data with the service role (RLS-exempt), as the server would.
  const { rows: planRows } = await admin.query<{ id: string }>(
    `insert into plans (user_id, status, start_date, end_date, generator_version, generator_input)
     values ($1, 'active', '2026-08-03', '2026-11-09', '1.0.0', '{}'::jsonb) returning id`,
    [alice],
  );
  const planId = planRows[0]!.id;

  const { rows: sessionRows } = await admin.query<{ id: string }>(
    `insert into sessions (user_id, plan_id, date, discipline, title, purpose, planned_seconds)
     values ($1, $2, '2026-08-05', 'bike', 'Easy ride', 'Builds the aerobic base.', 2700)
     returning id`,
    [alice, planId],
  );
  const sessionId = sessionRows[0]!.id;

  await admin.query(
    `insert into races (user_id, name, race_date, distance) values ($1, 'Riverside Sprint', '2026-11-08', 'sprint')`,
    [alice],
  );
  await admin.query(
    `insert into daily_metrics (user_id, date, load) values ($1, '2026-08-05', 42)`,
    [alice],
  );
  await admin.query(
    `insert into activities (user_id, source, external_id, discipline, started_at, local_date, duration_sec)
     values ($1, 'strava', '999', 'bike', now(), '2026-08-05', 2700)`,
    [alice],
  );
  await admin.query(
    `insert into integrations (user_id, provider, access_token, refresh_token)
     values ($1, 'strava', 'SECRET-ACCESS-TOKEN', 'SECRET-REFRESH-TOKEN')`,
    [alice],
  );

  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  console.log('\n--- an athlete can reach their own data ---');
  await asUser(client, alice, async () => {
    await expectAccess(client, 'alice reads her own sessions', 'select id from sessions');
    await expectAccess(client, 'alice reads her own plan', 'select id from plans');
    await expectAccess(client, 'alice reads her own races', 'select id from races');
    await expectAccess(client, 'alice reads her own metrics', 'select date from daily_metrics');
    await expectAccess(
      client,
      'alice logs a session',
      `update sessions set status = 'completed', rpe = 5 where id = $1 returning id`,
      [sessionId],
    );
  });

  console.log('\n--- another athlete is completely walled off ---');
  await asUser(client, bob, async () => {
    await expectNoAccess(client, 'bob cannot read alice sessions', 'select id from sessions');
    await expectNoAccess(client, 'bob cannot read alice plans', 'select id from plans');
    await expectNoAccess(client, 'bob cannot read alice races', 'select id from races');
    await expectNoAccess(client, 'bob cannot read alice activities', 'select id from activities');
    await expectNoAccess(client, 'bob cannot read alice metrics', 'select date from daily_metrics');
    // Bob legitimately sees his own profile row, so this must name Alice's.
    await expectNoAccess(
      client,
      "bob cannot read alice's profile",
      'select id from profiles where id = $1',
      [alice],
    );
    await expectAccess(
      client,
      'bob can still read his own profile',
      'select id from profiles where id = $1',
      [bob],
    );

    await expectNoAccess(
      client,
      'bob cannot update alice session',
      `update sessions set title = 'hijacked' where id = $1 returning id`,
      [sessionId],
    );
    await expectNoAccess(
      client,
      'bob cannot delete alice session',
      'delete from sessions where id = $1 returning id',
      [sessionId],
    );
    await expectNoAccess(
      client,
      'bob cannot forge a session owned by alice',
      `insert into sessions (user_id, date, discipline, title, purpose)
       values ($1, '2026-08-06', 'run', 'Forged', 'Nope.') returning id`,
      [alice],
    );
    await expectNoAccess(
      client,
      'bob cannot forge a plan owned by alice',
      `insert into plans (user_id, status, start_date, end_date, generator_version, generator_input)
       values ($1, 'draft', '2026-08-03', '2026-09-03', '1.0.0', '{}'::jsonb) returning id`,
      [alice],
    );
  });

  console.log('\n--- signed-out users see nothing ---');
  await client.query('begin');
  await client.query("select set_config('role', 'anon', true)");
  await client.query("select set_config('request.jwt.claims', '', true)");
  await expectNoAccess(client, 'anon cannot read sessions', 'select id from sessions');
  await expectNoAccess(client, 'anon cannot read profiles', 'select id from profiles');
  await expectNoAccess(client, 'anon cannot read integrations', 'select id from integrations');
  await client.query('rollback');

  console.log('\n--- oauth tokens never reach the client ---');
  await asUser(client, alice, async () => {
    const tokenRead = await probe(client, 'select access_token from integrations', []);
    record(
      'alice cannot select her own access_token column',
      'error' in tokenRead || tokenRead.rows === 0,
      'the token column was readable by an authenticated client',
    );
    await expectAccess(
      client,
      'alice can see integration status without tokens',
      'select provider, status from integrations_public',
    );
  });

  console.log('\n--- no table may ship without RLS ---');
  const { rows: unprotected } = await admin.query<{ tablename: string }>(
    `select c.relname as tablename
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false
     order by 1`,
  );
  record(
    'every public table has row level security enabled',
    unprotected.length === 0,
    unprotected.length ? `missing on: ${unprotected.map((r) => r.tablename).join(', ')}` : undefined,
  );

  const { rows: policyless } = await admin.query<{ tablename: string }>(
    `select c.relname as tablename
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = true
       and not exists (select 1 from pg_policy p where p.polrelid = c.oid)
     order by 1`,
  );
  record(
    'every protected table has at least one policy',
    policyless.length === 0,
    policyless.length ? `no policies on: ${policyless.map((r) => r.tablename).join(', ')}` : undefined,
  );

  await client.end();
  await admin.end();

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${String(results.length - failed.length)}/${String(results.length)} assertions passed`,
  );
  if (failed.length > 0) {
    console.error(`\n${String(failed.length)} RLS FAILURE(S) — this is a data-isolation bug.`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
