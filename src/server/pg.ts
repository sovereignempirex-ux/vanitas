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
`;

let schemaReady: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!databasePool) return Promise.resolve();
  if (!schemaReady) {
    schemaReady = databasePool
      .query(SCHEMA_DDL)
      .then(() => undefined)
      .catch((err: Error) => {
        console.error('[schema] ensure failed:', err.message);
        schemaReady = null; // retry on the next request
        throw err;
      });
  }
  return schemaReady;
}
