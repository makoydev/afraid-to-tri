-- Core schema — see docs/04-data-model.md
--
-- Conventions:
--   * calendar days the athlete perceives as days are `date`, never `timestamptz`
--   * durations in seconds, distances in metres
--   * `client_id` columns exist so offline mutation replay is idempotent

create extension if not exists "pgcrypto";

/* ---------------------------------------------------------------- enums -- */

create type experience_tier as enum ('first_timer', 'improver', 'experienced');
create type unit_system     as enum ('metric', 'imperial');
create type swim_track      as enum ('learn', 'develop', 'refine');
create type race_distance   as enum ('super_sprint','sprint','olympic','half','full','duathlon','aquabike','custom');
create type race_priority   as enum ('a','b','c');
create type water_type      as enum ('pool','lake','river','sea','unknown');
create type plan_status     as enum ('draft','active','completed','abandoned');
create type plan_phase      as enum ('prep','base','build','peak','taper','race','recovery');
create type discipline      as enum ('swim','bike','run','brick','strength','mobility','rest','race');
create type session_status  as enum ('planned','completed','partial','skipped','missed');
create type skip_reason     as enum ('ill','injured','travel','life','tired','weather','other');
create type body_check      as enum ('fine','niggle','pain');
create type activity_source as enum ('strava','garmin','apple_health','health_connect','manual','app');

/* ------------------------------------------------------------- profiles -- */

create table profiles (
  id                       uuid primary key references auth.users(id) on delete cascade,
  display_name             text,
  avatar_url               text,
  timezone                 text not null default 'UTC',
  units                    unit_system not null default 'metric',
  date_of_birth            date,
  experience_tier          experience_tier not null default 'first_timer',
  training_age_months      smallint not null default 0 check (training_age_months >= 0),

  swim_continuous_m        integer check (swim_continuous_m >= 0),
  swim_css_sec_per_100m    integer check (swim_css_sec_per_100m > 0),
  swim_track               swim_track not null default 'develop',
  bike_continuous_sec      integer check (bike_continuous_sec >= 0),
  bike_ftp_watts           integer check (bike_ftp_watts > 0),
  bike_lthr                smallint check (bike_lthr between 60 and 240),
  run_continuous_sec       integer check (run_continuous_sec >= 0),
  run_threshold_sec_per_km integer check (run_threshold_sec_per_km > 0),
  run_lthr                 smallint check (run_lthr between 60 and 240),
  max_hr                   smallint check (max_hr between 60 and 240),
  resting_hr               smallint check (resting_hr between 25 and 120),

  confidence               jsonb not null default '{"swim":2,"bike":2,"run":2}'::jsonb,
  availability             jsonb not null default '{}'::jsonb,
  equipment                jsonb not null default '{}'::jsonb,
  constraints              jsonb not null default '{}'::jsonb,

  onboarding_step          smallint not null default 0,
  onboarding_completed_at  timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

/* ---------------------------------------------------------------- races -- */

create table races (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles(id) on delete cascade,
  name             text not null check (length(trim(name)) > 0),
  race_date        date not null,
  distance         race_distance not null,
  priority         race_priority not null default 'a',
  location         text,
  water_type       water_type not null default 'unknown',
  water_temp_c     numeric(4,1),
  wetsuit_legal    boolean,
  swim_m           integer,
  bike_m           integer,
  run_m            integer,
  elevation_bike_m integer,
  notes            text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index races_user_date_idx on races (user_id, race_date);

/* ----------------------------------------------------------------- plans -- */

create table plans (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles(id) on delete cascade,
  race_id           uuid references races(id) on delete set null,
  status            plan_status not null default 'draft',
  start_date        date not null,
  end_date          date not null,
  goal_mode         text not null default 'race' check (goal_mode in ('race','fitness','finish_only')),
  -- Reproducibility: any plan can be regenerated from these two columns.
  generator_version text not null,
  generator_input   jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);
-- At most one active plan per athlete.
create unique index plans_one_active_idx on plans (user_id) where status = 'active';

create table plan_weeks (
  id             uuid primary key default gen_random_uuid(),
  plan_id        uuid not null references plans(id) on delete cascade,
  user_id        uuid not null references profiles(id) on delete cascade,
  week_index     smallint not null check (week_index >= 0),
  start_date     date not null,
  phase          plan_phase not null,
  is_recovery    boolean not null default false,
  target_load    numeric(7,1) not null default 0,
  target_seconds integer not null default 0,
  focus          text,
  created_at timestamptz not null default now(),
  unique (plan_id, week_index)
);
create index plan_weeks_user_idx on plan_weeks (user_id, start_date);

/* ------------------------------------------------------------ activities -- */

create table activities (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  source         activity_source not null,
  external_id    text,
  discipline     discipline not null,
  started_at     timestamptz not null,
  local_date     date not null,
  duration_sec   integer not null check (duration_sec >= 0),
  moving_sec     integer,
  distance_m     integer,
  avg_hr         smallint,
  max_hr         smallint,
  avg_power      smallint,
  weighted_power smallint,
  elevation_m    integer,
  calories       integer,
  name           text,
  raw            jsonb,
  streams_url    text,
  imported_at    timestamptz not null default now(),
  -- Makes duplicate webhook delivery a no-op.
  unique (user_id, source, external_id)
);
create index activities_user_date_idx on activities (user_id, local_date);

/* -------------------------------------------------------------- sessions -- */

create table sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles(id) on delete cascade,
  plan_id           uuid references plans(id) on delete cascade,
  plan_week_id      uuid references plan_weeks(id) on delete cascade,

  date              date not null,
  discipline        discipline not null,
  template_id       text,
  title             text not null check (length(trim(title)) > 0),
  -- Every session explains itself. Enforced here as well as in the domain.
  purpose           text not null check (length(trim(purpose)) > 0),
  tags              text[] not null default '{}',
  zone              smallint check (zone between 1 and 5),

  planned_seconds   integer check (planned_seconds >= 0),
  planned_meters    integer check (planned_meters >= 0),
  planned_load      numeric(6,1),
  steps             jsonb not null default '[]'::jsonb,

  status            session_status not null default 'planned',
  actual_seconds    integer check (actual_seconds >= 0),
  actual_meters     integer check (actual_meters >= 0),
  actual_load       numeric(6,1),
  rpe               smallint check (rpe between 1 and 10),
  avg_hr            smallint,
  max_hr            smallint,
  avg_power         smallint,
  weighted_power    smallint,
  elevation_m       integer,
  body_check        body_check,
  note              text,
  completed_at      timestamptz,
  skip_reason       skip_reason,

  activity_id       uuid references activities(id) on delete set null,

  -- Offline sync: the client mints this before the request, so a replayed
  -- mutation upserts instead of duplicating.
  client_id         text,
  client_updated_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sessions_user_date_idx on sessions (user_id, date);
create index sessions_plan_date_idx on sessions (plan_id, date);
create index sessions_user_planned_idx on sessions (user_id, date) where status = 'planned';
create unique index sessions_client_id_idx on sessions (user_id, client_id) where client_id is not null;

/* --------------------------------------------------------- daily_metrics -- */

create table daily_metrics (
  user_id       uuid not null references profiles(id) on delete cascade,
  date          date not null,
  load          numeric(7,1) not null default 0,
  fitness       numeric(7,2) not null default 0,
  fatigue       numeric(7,2) not null default 0,
  freshness     numeric(7,2) not null default 0,
  resting_hr    smallint,
  hrv_ms        smallint,
  sleep_sec     integer,
  sleep_quality smallint check (sleep_quality between 1 and 5),
  soreness      smallint check (soreness between 1 and 5),
  motivation    smallint check (motivation between 1 and 5),
  readiness     smallint check (readiness between 0 and 100),
  primary key (user_id, date)
);

/* ------------------------------------------------------ plan_adjustments -- */

create table plan_adjustments (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references profiles(id) on delete cascade,
  plan_id              uuid not null references plans(id) on delete cascade,
  rule_id              text not null,
  type                 text not null,
  -- Shown verbatim to the athlete.
  reason               text not null check (length(trim(reason)) > 0),
  magnitude            numeric(4,2),
  affected_session_ids uuid[] not null default '{}',
  snapshot             jsonb not null,
  applied_at           timestamptz not null default now(),
  reverted_at          timestamptz,
  seen_at              timestamptz
);
create index plan_adjustments_user_idx on plan_adjustments (user_id, applied_at desc);

/* ---------------------------------------------------------- integrations -- */

create table integrations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles(id) on delete cascade,
  provider         activity_source not null,
  external_user_id text,
  -- Never exposed to the client; see the RLS migration.
  access_token     text not null,
  refresh_token    text,
  expires_at       timestamptz,
  scopes           text[],
  webhook_id       text,
  last_sync_at     timestamptz,
  last_error       text,
  status           text not null default 'active' check (status in ('active','expired','revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

/* ------------------------------------------------------------- triggers -- */

create or replace function set_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at     before update on profiles     for each row execute function set_updated_at();
create trigger races_updated_at        before update on races        for each row execute function set_updated_at();
create trigger plans_updated_at        before update on plans        for each row execute function set_updated_at();
create trigger sessions_updated_at     before update on sessions     for each row execute function set_updated_at();
create trigger integrations_updated_at before update on integrations for each row execute function set_updated_at();

/* --------------------------------------------------------- new user hook -- */

-- Every auth user gets a profile row, so the app never has to handle a
-- signed-in user without one.
create or replace function handle_new_user() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', null))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
