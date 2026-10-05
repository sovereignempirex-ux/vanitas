import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
// The whole point of `npm run db:migrate` is that DATABASE_URL comes from .env —
// without this import the script could never read it.
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env first.');
  process.exit(1);
}

const schemaPath = path.join(__dirname, '..', 'supabase', 'schema.sql');
const sql = fs.readFileSync(schemaPath, 'utf8');
// Verify the certificate by default — see src/server/pg.ts for why
// rejectUnauthorized:false is dangerous. PG_INSECURE_SSL=true opts back out
// for a self-signed development server.
const needsSsl = /supabase\.co|neon\.tech|sslmode=require/.test(url);
const ssl = needsSsl ? { rejectUnauthorized: process.env.PG_INSECURE_SSL !== 'true' } : undefined;
const pool = new Pool({ connectionString: url, ssl });

try {
  await pool.query(sql);
  console.log('Migration applied: supabase/schema.sql');
} catch (e) {
  console.error('Migration failed:', e.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
