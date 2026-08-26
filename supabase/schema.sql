-- Free-tier Supabase/PostgreSQL schema for persistent suggestions.
-- Run in Supabase SQL Editor. The application can use its in-memory fallback
-- until SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are configured server-side.

create extension if not exists pgcrypto;

create table if not exists public.product_suggestions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 140),
  details text not null check (char_length(details) between 3 and 5000),
  category text not null check (category in ('bug', 'feature', 'ux')),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved')),
  code text,
  author_name text not null,
  admin_note text,
  created_at timestamptz not null default now()
);

alter table public.product_suggestions enable row level security;

-- Supabase exposes the `authenticated` role; plain PostgreSQL does not. Keep
-- the migration portable for both. The application uses a server-side DB role.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'create policy "authenticated users can submit suggestions"
      on public.product_suggestions for insert to authenticated with check (true)';
  end if;
end $$;

create index if not exists product_suggestions_status_created_at_idx
  on public.product_suggestions (status, created_at desc);
