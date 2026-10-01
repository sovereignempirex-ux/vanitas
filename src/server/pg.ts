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
