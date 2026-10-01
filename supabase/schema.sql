-- Vanitas production PostgreSQL schema (Supabase + Neon + plain Postgres compatible)
-- Run: psql $DATABASE_URL -f supabase/schema.sql
-- Or paste into Supabase SQL Editor.
-- App uses DATABASE_URL server-side only. Never expose to browser.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Product suggestions (persistent, replaces in-memory fallback)
-- ---------------------------------------------------------------------------
create table if not exists public.product_suggestions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 140),
  details text not null check (char_length(details) between 3 and 5000),
  category text not null check (category in ('bug', 'feature', 'ux')),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved')),
  code text check (code is null or char_length(code) <= 20000),
  author_name text not null check (char_length(author_name) between 1 and 80),
  admin_note text check (admin_note is null or char_length(admin_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- API keys metadata (raw secrets are NEVER stored — only prefix + sha256 hash)
-- ---------------------------------------------------------------------------
create table if not exists public.api_keys (
  id text primary key,
  name text not null check (char_length(name) between 3 and 80),
  key_prefix text not null,
  secret_hash text not null,
  owner_id text not null,
  owner_name text not null,
  scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'revoked', 'suspended')),
  environment text not null default 'live' check (environment in ('live', 'test')),
  rate_limit_per_min integer not null default 600 check (rate_limit_per_min between 10 and 10000),
  monthly_quota integer not null default 300000,
  usage_count bigint not null default 0,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz
);
create index if not exists api_keys_owner_idx on public.api_keys (owner_id);
create index if not exists api_keys_status_idx on public.api_keys (status);

-- ---------------------------------------------------------------------------
-- Audit logs (append-only, 90-day retention recommended)
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id text primary key,
  timestamp timestamptz not null default now(),
  actor_id text not null,
  actor_name text not null,
  actor_email text not null,
  action text not null,
  category text not null check (category in ('ADMIN','API','SECURITY','AUTH','KEYS','BOT','DATABASE')),
  target text not null,
  source text not null,
  status text not null,
  request_id text not null,
  ip_address text not null,
  metadata jsonb not null default '{}'
);
create index if not exists audit_logs_timestamp_idx on public.audit_logs (timestamp desc);
create index if not exists audit_logs_category_idx on public.audit_logs (category);

-- ---------------------------------------------------------------------------
-- Webhooks
-- ---------------------------------------------------------------------------
create table if not exists public.webhooks (
  id text primary key,
  name text not null check (char_length(name) between 3 and 80),
  url text not null check (char_length(url) between 12 and 2048),
  events text[] not null,
  secret_hash text not null,
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  last_triggered_at timestamptz,
  failure_count integer not null default 0
);

-- ---------------------------------------------------------------------------
-- RLS: deny direct browser access — all access via server role (service_role /
-- DATABASE_URL). Enable RLS with NO permissive policies for anon.
-- ---------------------------------------------------------------------------
alter table public.product_suggestions enable row level security;
alter table public.api_keys enable row level security;
alter table public.audit_logs enable row level security;
alter table public.webhooks enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    -- Authenticated users may INSERT suggestions only. Everything else
    -- goes through the server-side service role.
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'product_suggestions'
      and policyname = 'authenticated users can submit suggestions'
    ) then
      execute 'create policy "authenticated users can submit suggestions"
        on public.product_suggestions for insert to authenticated with check (true)';
    end if;
  end if;
end $$;

create index if not exists product_suggestions_status_created_at_idx
  on public.product_suggestions (status, created_at desc);
