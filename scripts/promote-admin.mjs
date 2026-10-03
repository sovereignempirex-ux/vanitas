// Ops: promote a specific user account to ADMIN on the database pointed to by
// DATABASE_URL (.env locally / Vercel env in production).
//
//   node scripts/promote-admin.mjs <userId>          # exact account id
//   node scripts/promote-admin.mjs --find "SOVEREIGN" # locate accounts by name
//
// Safety rails: never prints DATABASE_URL or secrets; refuses to touch any
// account unless the id (or an unambiguous name match) is confirmed first;
// shows role before/after and the admin count.
import dotenv from 'dotenv';
import { Pool } from 'pg';

// `.env.vercel` (from `npx vercel env pull`) carries the REAL production
// values and must win over the local `.env` placeholders. dotenv never
// overwrites keys that are already set, so load it first.
dotenv.config({ path: '.env.vercel' });
dotenv.config({ path: '.env' });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not configured — refusing.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: url,
  ssl: /supabase\.co|neon\.tech|sslmode=require/.test(url) ? { rejectUnauthorized: false } : undefined,
});

const mask = (email) => {
  if (!email || !email.includes('@')) return '(no email)';
  const [user, domain] = email.split('@');
  return `${user.slice(0, 2)}***@${domain}`;
};

const args = process.argv.slice(2);
let exitCode = 0;

try {
  if (args[0] === '--find') {
    const term = (args[1] || '').trim();
    if (!term) throw new Error('usage: --find "<name fragment>"');
    const r = await pool.query(
      `select id, name, role, email from public.users
        where name ilike $1 or email ilike $1 order by created_at limit 10`,
      [`%${term}%`],
    );
    console.log(`matches: ${r.rowCount}`);
    for (const u of r.rows) console.log(`  ${u.id}  role=${u.role}  name=${JSON.stringify(u.name)}  email=${mask(u.email)}`);
    if (r.rowCount === 0) exitCode = 1;
  } else {
    const userId = (args[0] || '').trim();
    if (!/^usr_[A-Za-z0-9_]+$/.test(userId)) {
      throw new Error('usage: promote-admin.mjs <userId> | --find "<name>"');
    }

    const before = await pool.query('select id, name, role, email from public.users where id = $1', [userId]);
    if (before.rowCount === 0) {
      console.error(`no account with id ${userId} on this database — nothing changed.`);
      exitCode = 1;
    } else {
      const u = before.rows[0];
      console.log(`target: ${u.id}  name=${JSON.stringify(u.name)}  email=${mask(u.email)}  role=${u.role}`);
      if (u.role === 'ADMIN') {
        console.log('already ADMIN — nothing to change.');
      } else {
        await pool.query(`update public.users set role = 'ADMIN' where id = $1`, [userId]);
        const after = await pool.query('select role from public.users where id = $1', [userId]);
        console.log(`role after: ${after.rows[0].role}`);
      }
      const admins = await pool.query(`select count(*)::int as n from public.users where role = 'ADMIN'`);
      console.log(`total admins now: ${admins.rows[0].n}`);
    }
  }
} catch (err) {
  console.error('ERROR:', err?.message || String(err));
  exitCode = 1;
} finally {
  await pool.end().catch(() => {});
  process.exit(exitCode);
}
