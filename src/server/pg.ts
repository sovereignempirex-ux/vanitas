import { Pool } from 'pg';

// PostgreSQL pool with SSL auto-detect (required for Supabase / Neon).
// Lives in its own module so both server.ts and authStore.ts can use it
// without circular imports. Server-side only — never expose DATABASE_URL.
//
// Certificate verification is ON by default. The previous build passed
// `rejectUnauthorized: false`, which accepts ANY certificate for the TLS
// connection — an on-path attacker can present their own cert, terminate the
// connection and read DATABASE_URL plus every password hash, session hash and
// API-key hash that crosses it, with no warning anywhere. Only set
// PG_INSECURE_SSL=true for a self-signed development server you control.
const sslInsecure = process.env.PG_INSECURE_SSL === 'true';

export const databasePool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 8,
      ssl: /supabase\.co|neon\.tech|sslmode=require/.test(process.env.DATABASE_URL)
        ? { rejectUnauthorized: !sslInsecure }
        : undefined,
    })
  : null;

if (databasePool) {
  databasePool.on('error', (err) => console.error('[db] pool error:', (err as Error).message));
}

// ---------------------------------------------------------------------------
// Lazy schema guard: supabase/schema.sql also ships newer objects (comments
// table, TOTP secret column) that a database provisioned before those changes
// won't have. Create them on first use so every deployment works without
// manual database access. Idempotent (IF NOT EXISTS) and memoized — runs at
// most once per process.
// ---------------------------------------------------------------------------
const SCHEMA_DDL = `
create table if not exists public.comments (
  id text primary key,
  doc_id text not null,
  user_id text not null references public.users(id) on delete cascade,
  author_name text not null default '',
  author_avatar text not null default '',
  body text not null check (char_length(body) between 2 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists comments_doc_created_idx on public.comments (doc_id, created_at desc);
create index if not exists comments_user_idx on public.comments (user_id);
alter table public.comments enable row level security;
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
create table if not exists public.direct_messages (
  id text primary key,
  sender_id text not null references public.users(id) on delete cascade,
  recipient_id text not null references public.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check (sender_id <> recipient_id)
);
create index if not exists direct_messages_pair_created_idx
  on public.direct_messages (sender_id, recipient_id, created_at desc);
create index if not exists direct_messages_recipient_unread_idx
  on public.direct_messages (recipient_id, created_at desc) where read_at is null;
alter table public.direct_messages enable row level security;
create table if not exists public.admin_invites (
  id text primary key,
  token text not null unique,
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
alter table public.admin_invites enable row level security;
alter table if exists public.users add column if not exists two_factor_secret text not null default '';
alter table if exists public.users add column if not exists verification text not null default '';
alter table if exists public.users add column if not exists username text not null default '';
alter table if exists public.users add column if not exists bio text not null default '';
-- Profile accent colour: user-chosen #RRGGBB that tints the profile banner
-- ('' = keep the default gradient). Validated at the API before it is stored.
alter table if exists public.users add column if not exists accent_color text not null default '';
-- Profile extras: a single-line status under the name and the account's
-- published links (jsonb array of {label,url} — every field validated at the
-- API before it is stored; '' / [] clear the value).
alter table if exists public.users add column if not exists status_line text not null default '';
alter table if exists public.users add column if not exists profile_links jsonb not null default '[]';
-- Profile identity extras: a free-text location and an ordered list of
-- short tech tags, both rendered on the public /u/<username> page. '' / []
-- clear the value; every value is length-checked at the API before storage.
alter table if exists public.users add column if not exists location text not null default '';
alter table if exists public.users add column if not exists tech_tags jsonb not null default '[]';
-- TOTP replay watermark: highest time-step already spent on a login.
alter table if exists public.users add column if not exists totp_last_step bigint not null default 0;
-- TOTP brute-force lockout: failed 2FA attempts and the resulting cooldown.
-- A 6-digit code with a +/-1 step window is only ~3 candidate codes, so an
-- unlimited retry loop would defeat 2FA in days. (see authStore.ts)
alter table if exists public.users add column if not exists totp_failed_attempts int not null default 0;
alter table if exists public.users add column if not exists totp_locked_until timestamptz;
-- API keys: the "record" column is the full ApiKey snapshot (apiKeyStore.ts).
-- db.apiKeys used to be process-local only, so every restart wiped every key
-- you had created; hydration + this column make them durable. "masked_secret"
-- is the display-only prefix-suffix string the dashboard renders.
alter table if exists public.api_keys add column if not exists record jsonb;
alter table if exists public.api_keys add column if not exists masked_secret text;
-- Publishing & sandbox: the user's GitHub grant (AES-256-GCM
-- ciphertext, never the raw token), published projects and
-- individual code snippets. All FK-cascade with the account.
create table if not exists public.github_tokens (
  user_id text primary key references public.users(id) on delete cascade,
  access_token text not null,
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.published_projects (
  id text primary key,
  owner_id text not null references public.users(id) on delete cascade,
  source text not null check (source in ('github', 'manual')),
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '',
  repo_url text not null default '',
  language text not null default '',
  is_web boolean not null default false,
  files jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index if not exists published_projects_owner_idx on public.published_projects (owner_id, created_at desc);
create index if not exists published_projects_created_idx on public.published_projects (created_at desc);
alter table public.published_projects enable row level security;
create table if not exists public.published_snippets (
  id text primary key,
  owner_id text not null references public.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  language text not null default 'text',
  content text not null check (char_length(content) between 1 and 100000),
  created_at timestamptz not null default now()
);
create index if not exists published_snippets_owner_idx on public.published_snippets (owner_id, created_at desc);
create index if not exists published_snippets_created_idx on public.published_snippets (created_at desc);
alter table public.published_snippets enable row level security;
-- Invite tokens are live credentials (some grant ADMIN): look them up by
-- sha256 hash, never by the raw value. The token column itself only ever
-- holds either the legacy plaintext (pre-hardening rows) or the enc:v1:
-- AES-256-GCM ciphertext of the token.
alter table if exists public.admin_invites add column if not exists token_hash text not null default '';
create unique index if not exists admin_invites_token_hash_idx
  on public.admin_invites (token_hash) where token_hash <> '';
`;

let schemaReady: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!databasePool) return Promise.resolve();
  if (!schemaReady) {
    schemaReady = databasePool
      .query(SCHEMA_DDL)
      .then(() =>
        // Best effort: usernames are unique from now on, but a database that
        // already contains historical duplicates must keep serving traffic —
        // application-level checks (register + PATCH) still enforce uniqueness.
        databasePool!
          .query(
            `create unique index if not exists users_username_unique_idx
               on public.users (lower(username)) where username <> ''`,
          )
          .catch((err: Error) => {
            console.warn('[schema] username unique index skipped (fix duplicates first):', err.message);
          }),
      )
      .then(() => undefined)
      .catch((err: Error) => {
        console.error('[schema] ensure failed:', err.message);
        schemaReady = null; // retry on the next request
        throw err;
      });
  }
  return schemaReady;
}
