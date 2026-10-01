// Validates supabase/schema.sql + the auth queries from src/server/authStore.ts
// against a real (WASM) PostgreSQL — catches DDL/SQL errors before deploy.
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';

// pgcrypto ships as a PGLite add-on; real Postgres/Supabase include it natively.
let extensions;
try {
  const mod = await import('@electric-sql/pglite/contrib/pgcrypto');
  extensions = { pgcrypto: mod.pgcrypto ?? mod.default };
} catch {
  extensions = undefined;
}
const db = new PGlite(extensions ? { extensions } : undefined);
let failures = 0;

function ok(label) {
  console.log(`  PASS  ${label}`);
}
function bad(label, err) {
  failures++;
  console.log(`  FAIL  ${label} → ${err?.message || err}`);
}

async function must(label, fn) {
  try {
    await fn();
    ok(label);
  } catch (err) {
    bad(label, err);
  }
}

let schemaSql = fs.readFileSync('supabase/schema.sql', 'utf8');
if (!extensions) {
  // Harness limitation only — real Postgres/Supabase/Neon ship pgcrypto.
  schemaSql = schemaSql.replace(/^create extension.*$/gim, '-- pgcrypto unavailable in test harness');
}

// ---- 1. full schema -------------------------------------------------------
try {
  await db.exec(schemaSql);
  ok('supabase/schema.sql applies cleanly');
} catch (err) {
  bad('supabase/schema.sql applies cleanly', err);
}

// Idempotency: running it twice must not fail (used by npm run db:migrate).
try {
  await db.exec(schemaSql);
  ok('schema is idempotent (second run)');
} catch (err) {
  bad('schema is idempotent (second run)', err);
}

const tables = await db.query(`select table_name from information_schema.tables where table_schema='public' order by 1`);
const names = tables.rows.map((r) => r.table_name);
for (const t of ['users', 'auth_sessions']) {
  if (names.includes(t)) ok(`table ${t} exists`);
  else bad(`table ${t} exists`, new Error(`missing; have: ${names.join(', ')}`));
}

// RLS must be enabled with no anon policies on auth tables.
for (const t of ['users', 'auth_sessions']) {
  await must(`RLS enabled on ${t}`, async () => {
    const r = await db.query(`select relrowsecurity from pg_class where oid = 'public.${t}'::regclass`);
    if (!r.rows[0]?.relrowsecurity) throw new Error('row security is OFF');
  });
}

// ---- 2. authStore queries -------------------------------------------------
const id = 'usr_test_1';
const email = 'First.User@Example.com';

await must('first account insert (fresh DB → bootstrap admin path)', async () => {
  const count = await db.query('select count(*)::int as n from public.users');
  if (count.rows[0].n !== 0) throw new Error('expected empty users table');
  await db.query(
    `insert into public.users (id, email, name, username, avatar_url, role, password_hash, created_at, last_login_at)
     values ($1, lower($2), $3, $4, $5, $6, $7, now(), now()) returning *`,
    [id, email, 'Test User', 'first_user', 'https://x/y.png', 'ADMIN', 'scrypt$16384$8$1$c2FsdA==$aGFzaA=='],
  );
});

await must('case-insensitive lookup (lower(email))', async () => {
  // The server lowercases the input first (authStore.verifyAccount), then matches lower(email).
  const input = 'FIRST.USER@EXAMPLE.COM'.trim().toLowerCase();
  const r = await db.query('select * from public.users where lower(email) = $1', [input]);
  if (r.rows.length !== 1) throw new Error(`expected 1 row, got ${r.rows.length}`);
});

await must('duplicate email (different case) rejected with 23505', async () => {
  try {
    await db.query('insert into public.users (id, email, name, password_hash) values ($1, lower($2), $3, $4)', [
      'usr_test_2',
      'first.user@example.com',
      'Dup',
      'x',
    ]);
    throw new Error('duplicate was accepted');
  } catch (err) {
    if (err.code !== '23505') throw err;
  }
});

await must('update last_login_at + role', async () => {
  await db.query('update public.users set last_login_at = now() where id = $1', [id]);
  await db.query(`update public.users set role = 'ADMIN' where id = $1`, [id]);
});

await must('create session + resolve via join', async () => {
  await db.query('insert into public.auth_sessions (token_hash, user_id, ip, user_agent, expires_at) values ($1,$2,$3,$4,$5)', [
    'hash_abc',
    id,
    '1.2.3.4',
    'test-agent',
    new Date(Date.now() + 60_000),
  ]);
  const r = await db.query(
    `select u.* from public.auth_sessions s join public.users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at > now()`,
    ['hash_abc'],
  );
  if (r.rows.length !== 1 || r.rows[0].id !== id) throw new Error('session join failed');
});

await must('expired session is NOT resolved', async () => {
  await db.query('insert into public.auth_sessions (token_hash, user_id, expires_at) values ($1,$2,$3)', [
    'hash_expired',
    id,
    new Date(Date.now() - 1000),
  ]);
  const r = await db.query(
    `select u.* from public.auth_sessions s join public.users u on u.id = s.user_id where s.token_hash = $1 and s.expires_at > now()`,
    ['hash_expired'],
  );
  if (r.rows.length !== 0) throw new Error('expired session still valid!');
});

await must('revoke session (delete by hash)', async () => {
  await db.query('delete from public.auth_sessions where token_hash = $1', ['hash_abc']);
  const r = await db.query('select 1 from public.auth_sessions where token_hash = $1', ['hash_abc']);
  if (r.rows.length !== 0) throw new Error('session still present');
});

await must('users cascade-delete their sessions', async () => {
  await db.query('delete from public.users where id = $1', [id]);
  const r = await db.query('select 1 from public.auth_sessions where user_id = $1', [id]);
  if (r.rows.length !== 0) throw new Error('orphan sessions remain');
});

console.log(failures ? `\n${failures} FAILED` : '\nALL SQL CHECKS PASSED');
process.exit(failures ? 1 : 0);
