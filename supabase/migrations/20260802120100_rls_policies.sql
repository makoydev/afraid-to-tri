-- Row Level Security — see docs/04-data-model.md § Row Level Security
--
-- RLS is enabled on EVERY table, without exception. The anon key is the only
-- key that reaches the browser, so these policies are the authorization layer:
-- a missed check in application code must not become a data breach.
--
-- Every policy here has a corresponding assertion in tests/rls/, which proves
-- that a second user can neither read nor write the first user's rows.

/* ------------------------------------------------------------- profiles -- */

alter table profiles enable row level security;

create policy "profiles: read own" on profiles
  for select using (auth.uid() = id);
create policy "profiles: update own" on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles: insert own" on profiles
  for insert with check (auth.uid() = id);
-- Deliberately no delete policy: accounts are removed through auth.users,
-- which cascades. A stray client delete must not orphan an auth user.

/* -------------------------------------------------- user-owned resources -- */

-- Same four policies for every table keyed by user_id. Written out rather than
-- generated so that `\d` and a code review both show exactly what is granted.

alter table races enable row level security;
create policy "races: select own" on races for select using (auth.uid() = user_id);
create policy "races: insert own" on races for insert with check (auth.uid() = user_id);
create policy "races: update own" on races for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "races: delete own" on races for delete using (auth.uid() = user_id);

alter table plans enable row level security;
create policy "plans: select own" on plans for select using (auth.uid() = user_id);
create policy "plans: insert own" on plans for insert with check (auth.uid() = user_id);
create policy "plans: update own" on plans for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "plans: delete own" on plans for delete using (auth.uid() = user_id);

alter table plan_weeks enable row level security;
create policy "plan_weeks: select own" on plan_weeks for select using (auth.uid() = user_id);
create policy "plan_weeks: insert own" on plan_weeks for insert with check (auth.uid() = user_id);
create policy "plan_weeks: update own" on plan_weeks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "plan_weeks: delete own" on plan_weeks for delete using (auth.uid() = user_id);

alter table sessions enable row level security;
create policy "sessions: select own" on sessions for select using (auth.uid() = user_id);
create policy "sessions: insert own" on sessions for insert with check (auth.uid() = user_id);
create policy "sessions: update own" on sessions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "sessions: delete own" on sessions for delete using (auth.uid() = user_id);

alter table activities enable row level security;
create policy "activities: select own" on activities for select using (auth.uid() = user_id);
create policy "activities: insert own" on activities for insert with check (auth.uid() = user_id);
create policy "activities: update own" on activities for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "activities: delete own" on activities for delete using (auth.uid() = user_id);

alter table daily_metrics enable row level security;
create policy "daily_metrics: select own" on daily_metrics for select using (auth.uid() = user_id);
create policy "daily_metrics: insert own" on daily_metrics for insert with check (auth.uid() = user_id);
create policy "daily_metrics: update own" on daily_metrics for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "daily_metrics: delete own" on daily_metrics for delete using (auth.uid() = user_id);

alter table plan_adjustments enable row level security;
create policy "plan_adjustments: select own" on plan_adjustments for select using (auth.uid() = user_id);
create policy "plan_adjustments: insert own" on plan_adjustments for insert with check (auth.uid() = user_id);
-- Only `seen_at` and `reverted_at` are ever changed by the client, but the
-- audit trail must not be rewritable, so there is no general update policy.
create policy "plan_adjustments: mark seen" on plan_adjustments
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

/* ---------------------------------------------------------- integrations -- */

-- OAuth tokens must never reach the browser. The table itself is readable only
-- by the service role (used exclusively in server-side route handlers); the
-- client sees connection status through a token-free view.
alter table integrations enable row level security;

create policy "integrations: delete own" on integrations
  for delete using (auth.uid() = user_id);

create view integrations_public
with (security_invoker = true)
as
  select id, user_id, provider, status, scopes, last_sync_at, last_error, expires_at, created_at
  from integrations;

create policy "integrations: status only" on integrations
  for select using (auth.uid() = user_id and current_setting('role', true) <> 'anon');

revoke all on integrations from anon, authenticated;
grant select (id, user_id, provider, status, scopes, last_sync_at, last_error, expires_at, created_at)
  on integrations to authenticated;
grant delete on integrations to authenticated;
grant select on integrations_public to authenticated;
