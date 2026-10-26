import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

/* Neon connection plus the schema, created on first use so no manual migration is needed. */

let sqlClient: NeonQueryFunction<false, false> | null = null;
let schemaReady: Promise<void> | null = null;

/**
 * Connection string from the environment. Besides DATABASE_URL it accepts the
 * names the Neon integration for Vercel creates, and tolerates stray quotes or
 * a duplicated "postgresql:" prefix from copy and paste.
 */
export function databaseUrl(): string | null {
  const raw = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL || '';
  const url = raw
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/^postgres(?:ql)?:(?=postgres(?:ql)?:\/\/)/, '');
  return url || null;
}

export function isConfigured(): boolean {
  return databaseUrl() !== null;
}

export function sql(): NeonQueryFunction<false, false> {
  if (!sqlClient) {
    const url = databaseUrl();
    if (!url) throw new Error('DATABASE_URL is not set');
    sqlClient = neon(url);
  }
  return sqlClient;
}

export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    const db = sql();
    schemaReady = (async () => {
      await db`
        CREATE TABLE IF NOT EXISTS users (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          email text NOT NULL UNIQUE,
          password_hash text NOT NULL,
          failed_logins integer NOT NULL DEFAULT 0,
          locked_until timestamptz,
          created_at timestamptz NOT NULL DEFAULT now()
        )`;
      await db`
        CREATE TABLE IF NOT EXISTS sessions (
          token_hash text PRIMARY KEY,
          user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          expires_at timestamptz NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )`;
      await db`CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id)`;
      await db`
        CREATE TABLE IF NOT EXISTS user_data (
          user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          data jsonb NOT NULL,
          version integer NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT now()
        )`;
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}
