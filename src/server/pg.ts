import { Pool } from 'pg';

// PostgreSQL pool with SSL auto-detect (required for Supabase / Neon).
// Lives in its own module so both server.ts and authStore.ts can use it
// without circular imports. Server-side only — never expose DATABASE_URL.
export const databasePool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 8,
      ssl: /supabase\.co|neon\.tech|sslmode=require/.test(process.env.DATABASE_URL) ? { rejectUnauthorized: false } : undefined,
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
-- TOTP replay watermark: highest time-step already spent on a login.
alter table if exists public.users add column if not exists totp_last_step bigint not null default 0;
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
