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

await must('users.totp_last_step watermark round-trips (bigint)', async () => {
  await db.query('update public.users set totp_last_step = $2 where id = $1', [id, 123456]);
  const r = await db.query('select totp_last_step from public.users where id = $1', [id]);
  if (Number(r.rows[0]?.totp_last_step) !== 123456) throw new Error('TOTP watermark lost');
  await db.query('update public.users set totp_last_step = 0 where id = $1', [id]);
});

await must('admin_invites.token_hash unique partial index (lookup by hash)', async () => {
  const exp = new Date(Date.now() + 60_000);
  await db.query(
    `insert into public.admin_invites (id, token, created_by, token_hash, expires_at)
     values ($1, $2, $3, $4, $5)`,
    ['inv_h1', 'enc:v1:ciphertext-one', id, 'hash_one', exp],
  );
  await db.query(
    `insert into public.admin_invites (id, token, created_by, token_hash, expires_at)
     values ($1, $2, $3, $4, $5)`,
    ['inv_h2', 'enc:v1:ciphertext-two', id, 'hash_two', exp],
  );
  // Duplicate hash must be rejected: two invites can never resolve to the
  // same lookup key (this is what findInviteByToken queries).
  try {
    await db.query(
      `insert into public.admin_invites (id, token, created_by, token_hash, expires_at)
       values ($1, $2, $3, $4, $5)`,
      ['inv_h3', 'enc:v1:ciphertext-three', id, 'hash_one', exp],
    );
    throw new Error('duplicate token_hash was accepted');
  } catch (err) {
    if (err.code !== '23505') throw err;
  }
  // Legacy rows ('' hash) are exempt from the partial index.
  await db.query(
    `insert into public.admin_invites (id, token, created_by, token_hash, expires_at)
     values ($1, $2, $3, '', $4)`,
    ['inv_legacy', 'legacy-plaintext-token', id, exp],
  );
  const r = await db.query(`delete from public.admin_invites where created_by = $1`, [id]);
  if (r.rowCount !== 3) throw new Error(`expected 3 invite rows, deleted ${r.rowCount}`);
});

await must('createInvite INSERT mapping (server.ts exact query + params)', async () => {
  // Mirrors server.ts createInvite byte-for-byte: a column/value misalignment
  // here previously put `0` into max_uses (check 1-20) and `false` into uses.
  const params = [
    'inv_map_1',
    'enc:v1:ivtagct',
    'hash_map_1',
    id,
    'Mapper',
    'ADMIN',
    'DEVELOPER',
    'note',
    3, // max_uses must land in max_uses (1..20), not in `uses`
    new Date(Date.now() + 86_400_000).toISOString(),
    new Date().toISOString(),
  ];
  const r = await db.query(
    `insert into public.admin_invites
       (id, token, token_hash, created_by, created_by_name, role, verification, note, max_uses, uses, revoked, expires_at, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, false, $10, $11) returning *`,
    params,
  );
  const row = r.rows[0];
  if (Number(row.max_uses) !== 3) throw new Error(`max_uses mapped to ${row.max_uses}`);
  if (Number(row.uses) !== 0) throw new Error(`uses mapped to ${row.uses}`);
  if (row.revoked !== false) throw new Error(`revoked mapped to ${row.revoked}`);
  if (row.role !== 'ADMIN' || row.verification !== 'DEVELOPER') throw new Error('role/verification mismatch');
  await db.query(`delete from public.admin_invites where id = $1`, ['inv_map_1']);
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

// ---- 3. OAuth identities ----------------------------------------------------
await must('RLS enabled on user_identities', async () => {
  const r = await db.query(`select relrowsecurity from pg_class where oid = 'public.user_identities'::regclass`);
  if (!r.rows[0]?.relrowsecurity) throw new Error('row security is OFF');
});

await must('identity insert + join resolves the user', async () => {
  await db.query(`insert into public.users (id, email, name, password_hash) values ('usr_oauth_t', 'oauth@test.com', 'O', '')`);
  await db.query(`insert into public.user_identities (provider, provider_id, user_id) values ('discord', 'd123', 'usr_oauth_t')`);
  const r = await db.query(
    `select u.* from public.user_identities i join public.users u on u.id = i.user_id where i.provider = $1 and i.provider_id = $2`,
    ['discord', 'd123'],
  );
  if (r.rows[0]?.id !== 'usr_oauth_t') throw new Error('join failed');
});

await must('duplicate identity / second link on same provider rejected (23505)', async () => {
  const expectConflict = async (sql, params) => {
    try {
      await db.query(sql, params);
      throw new Error('constraint was not enforced');
    } catch (err) {
      if (err.code !== '23505') throw err;
    }
  };
  await expectConflict(`insert into public.user_identities (provider, provider_id, user_id) values ('discord', 'd123', 'usr_oauth_t')`, []);
  await expectConflict(`insert into public.user_identities (provider, provider_id, user_id) values ('discord', 'd999', 'usr_oauth_t')`, []);
  // invalid provider is rejected by the CHECK constraint (23514), not the PK
  try {
    await db.query(`insert into public.user_identities (provider, provider_id, user_id) values ('other', 'x1', 'usr_oauth_t')`);
    throw new Error('invalid provider accepted');
  } catch (err) {
    if (err.code !== '23514') throw err;
  }
});

await must('OAuth account + identity atomic CTE insert (as used by upsertOAuthUser)', async () => {
  await db.query(
    `with new_user as (
       insert into public.users (id, email, name, username, avatar_url, role, password_hash, created_at, last_login_at)
       values ($1, lower($2), $3, $4, $5, $6, '', now(), now())
       returning id
     )
     insert into public.user_identities (provider, provider_id, user_id)
     select $7, $8, id from new_user`,
    ['usr_cte_1', 'CTE@Test.com', 'Cte User', 'cte_user', 'https://x/y.png', 'USER', 'google', 'g555'],
  );
  const u = await db.query('select 1 from public.users where id = $1', ['usr_cte_1']);
  const i = await db.query('select 1 from public.user_identities where provider_id = $1', ['g555']);
  if (!u.rows.length || !i.rows.length) throw new Error('CTE insert incomplete');
  await db.query('delete from public.users where id = $1', ['usr_cte_1']);
});

await must('identities cascade-delete with their user', async () => {
  await db.query(`delete from public.users where id = 'usr_oauth_t'`);
  const r = await db.query(`select 1 from public.user_identities where provider_id = 'd123'`);
  if (r.rows.length) throw new Error('orphan identity remains');
});

// ---- 4. api_keys (external API-key auth) ----------------------------------
await must('api_keys table exists, stores only the sha256 hash', async () => {
  const cols = await db.query(
    `select column_name from information_schema.columns where table_schema='public' and table_name='api_keys'`,
  );
  const names = cols.rows.map((r) => r.column_name);
  if (!names.includes('secret_hash')) throw new Error('secret_hash column missing');
  if (names.includes('secret') || names.includes('raw_secret')) throw new Error('raw secret column present!');
  const nullable = await db.query(
    `select is_nullable from information_schema.columns where table_schema='public' and table_name='api_keys' and column_name='secret_hash'`,
  );
  if (String(nullable.rows[0]?.is_nullable).toLowerCase() !== 'no') throw new Error('secret_hash must be NOT NULL');
});

await must('RLS enabled on api_keys with no anon policies', async () => {
  const r = await db.query(`select relrowsecurity from pg_class where oid = 'public.api_keys'::regclass`);
  if (!r.rows[0]?.relrowsecurity) throw new Error('row security is OFF');
  const p = await db.query(`select count(*)::int as n from pg_policies where tablename = 'api_keys'`);
  if (p.rows[0].n !== 0) throw new Error(`unexpected permissive policies: ${p.rows[0].n}`);
});

await must('api_keys insert + lookup by secret_hash', async () => {
  await db.query(
    `insert into public.api_keys (id, name, key_prefix, secret_hash, owner_id, owner_name, scopes, status, environment, rate_limit_per_min, monthly_quota, usage_count)
     values ($1, $2, $3, $4, $5, $6, array['api.read','bot.execute'], 'active', 'live', 600, 300000, 0)`,
    ['key_sql_1', 'SQL Check Key', 'sk_live_vanit', 'a'.repeat(64), 'usr_sql', 'SQL User'],
  );
  const r = await db.query(`select * from public.api_keys where secret_hash = $1`, ['a'.repeat(64)]);
  if (r.rows.length !== 1) throw new Error('secret_hash lookup failed');
  if (r.rows[0].status !== 'active' || r.rows[0].rate_limit_per_min !== 600) throw new Error('row mismatch');
  await db.query(`delete from public.api_keys where id = $1`, ['key_sql_1']);
});

await must('api_keys revoked status round-trips (middleware reads it)', async () => {
  await db.query(
    `insert into public.api_keys (id, name, key_prefix, secret_hash, owner_id, owner_name, scopes, status)
     values ('key_sql_2', 'Revoked Key', 'sk_live_vanit', $1, 'usr_sql', 'SQL User', array['api.read'], 'revoked')`,
    ['b'.repeat(64)],
  );
  const r = await db.query(`select status from public.api_keys where id = 'key_sql_2'`);
  if (r.rows[0]?.status !== 'revoked') throw new Error('status did not round-trip');
  await db.query(`delete from public.api_keys where id = 'key_sql_2'`);
});

console.log(failures ? `\n${failures} FAILED` : '\nALL SQL CHECKS PASSED');
process.exit(failures ? 1 : 0);
