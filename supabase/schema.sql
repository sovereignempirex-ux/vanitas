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
  expires_at timestamptz,
  -- Display-only `prefix••••suffix` string the dashboard renders.
  masked_secret text,
  -- Full ApiKey snapshot (src/server/apiKeyStore.ts). The plain columns above
  -- stay authoritative for queries/constraints; `record` round-trips the
  -- policy fields (burstLimit, actionOnExceed, usagePeriod, …) so a restart
  -- never silently resets a key's configuration or usage counters.
  record jsonb
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
-- The admin log filters by actor; without this it is a sequential scan per page.
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_id, timestamp desc);

-- ---------------------------------------------------------------------------
-- Developer invite links: a not-yet-registered person opens the link and the
-- granted role/badge is applied the moment they create their account.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_invites (
  id text primary key,
  token text not null unique,
  -- sha256(token): invite lookup goes through this hash (invite tokens are
  -- live credentials — some grant ADMIN), never through the raw value.
  token_hash text not null default '',
  created_by text not null,
  created_by_name text not null default '',
  role text not null default 'ADMIN' check (role in ('USER', 'ADMIN')),
  verification text not null default '',
  note text not null default '',
  max_uses int not null default 1 check (max_uses between 1 and 20),
  uses int not null default 0,
  revoked boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists admin_invites_created_idx on public.admin_invites (created_at desc);
create unique index if not exists admin_invites_token_hash_idx on public.admin_invites (token_hash) where token_hash <> '';

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
alter table public.admin_invites enable row level security;
alter table public.webhooks enable row level security;

do $$
declare pol record;
begin
  -- Drop any permissive policy on product_suggestions. An earlier revision
  -- shipped "create policy ... for insert to authenticated with check (true)"
  -- which let ANY signed-in Supabase tenant write unbounded rows straight into
  -- product_suggestions, bypassing every server-side validation and rate limit.
  -- The app only ever writes through DATABASE_URL (a superuser/service role,
  -- which RLS does not apply to), so the policy is removed rather than
  -- tightened: there is no legitimate caller for it. RLS enabled with zero
  -- policies = deny for everyone except the table owner.
  for pol in
    select policyname from pg_policies
     where schemaname = 'public' and tablename = 'product_suggestions'
  loop
    execute format('drop policy %I on public.product_suggestions', pol.policyname);
  end loop;
end $$;

create index if not exists product_suggestions_status_created_at_idx
  on public.product_suggestions (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Users (real accounts). Passwords are scrypt hashes — NEVER plaintext.
-- Accessed only through the server (service role / DATABASE_URL).
-- NOTE: defined BEFORE comments / auth_sessions / user_identities so their
-- foreign keys can reference it on a brand-new database.
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id text primary key,
  email text not null,
  name text not null check (char_length(name) between 1 and 80),
  username text not null default '',
  avatar_url text not null default '',
  bio text,
  role text not null default 'USER' check (role in ('USER', 'ADMIN')),
  verification text not null default '',
  password_hash text not null,
  two_factor_enabled boolean not null default false,
  two_factor_secret text not null default '',
  totp_last_step bigint not null default 0,
  -- TOTP brute-force lockout (see src/server/authStore.ts): after 5 wrong
  -- codes the account cools down instead of letting a 6-digit guess loop run.
  totp_failed_attempts int not null default 0,
  totp_locked_until timestamptz,
  -- Profile presentation: optional accent colour, one-line status and the
  -- account's published links. All three are validated at the API before use.
  accent_color text not null default '',
  status_line text not null default '',
  profile_links jsonb not null default '[]',
  connected_accounts jsonb not null default '{"google":false,"github":false,"discord":false}',
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);
create unique index if not exists users_email_uniq on public.users (lower(email));
create unique index if not exists users_username_unique_idx on public.users (lower(username)) where username <> '';
create index if not exists users_role_idx on public.users (role);

-- ---------------------------------------------------------------------------
-- Doc comments — REAL comments written by registered users under docs pages.
-- The table starts EMPTY by design: no seeded / fake comments, ever.
-- user_id cascades with the account so deleting a user never orphans rows
-- (must stay in sync with src/server/pg.ts SCHEMA_DDL).
-- ---------------------------------------------------------------------------
create table if not exists public.comments (
  id text primary key,
  doc_id text not null check (char_length(doc_id) between 1 and 64),
  user_id text not null references public.users(id) on delete cascade,
  author_name text not null default '' check (char_length(author_name) <= 80),
  author_avatar text not null default '',
  body text not null check (char_length(body) between 2 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists comments_doc_created_idx on public.comments (doc_id, created_at desc);
create index if not exists comments_user_idx on public.comments (user_id);
alter table public.comments enable row level security;

-- ---------------------------------------------------------------------------
-- AI assistant chat history (per user). Created here too so a database
-- provisioned only from this file matches src/server/pg.ts exactly instead of
-- silently falling back to a process-local history.
-- ---------------------------------------------------------------------------
create table if not exists public.ai_chat_messages (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  role text not null check (role in ('user', 'ai')),
  content text not null check (char_length(content) between 1 and 20000),
  persona text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists ai_chat_user_created_idx on public.ai_chat_messages (user_id, created_at desc);
alter table public.ai_chat_messages enable row level security;

-- ---------------------------------------------------------------------------
-- Login sessions. Only the sha256 hash of the bearer token is stored,
-- so a database leak cannot be replayed as a login.
-- ---------------------------------------------------------------------------
create table if not exists public.auth_sessions (
  token_hash text primary key,
  user_id text not null references public.users(id) on delete cascade,
  ip text not null default '',
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists auth_sessions_user_idx on public.auth_sessions (user_id);
create index if not exists auth_sessions_expires_idx on public.auth_sessions (expires_at);

-- ---------------------------------------------------------------------------
-- OAuth identities (Discord / Google / GitHub) — maps a provider account to
-- a local user. One identity per provider per user; cascade-deleted with the
-- user. Never contains tokens or secrets.
-- ---------------------------------------------------------------------------
create table if not exists public.user_identities (
  provider text not null check (provider in ('discord', 'google', 'github')),
  provider_id text not null check (char_length(provider_id) between 1 and 64),
  user_id text not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (provider, provider_id)
);
create unique index if not exists user_identities_user_provider_uniq
  on public.user_identities (user_id, provider);
create index if not exists user_identities_user_idx on public.user_identities (user_id);

-- RLS for auth tables: deny direct browser access — server role only.
alter table public.users enable row level security;
alter table public.auth_sessions enable row level security;
alter table public.user_identities enable row level security;

-- ---------------------------------------------------------------------------
-- Privileges.
--
-- RLS (above) only binds the Supabase API roles. It does nothing for a plain
-- PostgreSQL deployment, nor for any non-superuser role that happens to share
-- the database — and this schema holds password hashes, session token hashes,
-- API-key secret hashes and encrypted invite tokens. Every table here is
-- therefore denied to PUBLIC and to Supabase's anon/authenticated roles, and
-- granted back only to the role the app actually connects as.
--
-- The table OWNER keeps every privilege regardless of grants, so this can
-- never lock DATABASE_URL out of its own tables.
-- ---------------------------------------------------------------------------
do $$
declare
  tbl text;
  other_role text;
  vanitas_tables constant text[] := array[
    'product_suggestions', 'api_keys', 'audit_logs', 'admin_invites', 'webhooks',
    'comments', 'users', 'auth_sessions', 'user_identities', 'ai_chat_messages'
  ];
begin
  foreach tbl in array vanitas_tables loop
    if to_regclass('public.' || tbl) is not null then
      execute format('revoke all on public.%I from public', tbl);

      -- anon / authenticated exist only on Supabase; guard so plain
      -- PostgreSQL does not abort the whole migration.
      foreach other_role in array array['anon', 'authenticated'] loop
        if exists (select 1 from pg_roles where rolname = other_role) then
          execute format('revoke all on public.%I from %I', tbl, other_role);
        end if;
      end loop;

      if exists (select 1 from pg_roles where rolname = 'service_role') then
        execute format('grant select, insert, update, delete on public.%I to service_role', tbl);
      end if;
    end if;
  end loop;

  -- Objects created later by this same role inherit the same lockdown.
  execute 'alter default privileges in schema public revoke all on tables from public';
  execute 'alter default privileges in schema public revoke all on sequences from public';
end $$;
