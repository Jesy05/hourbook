import { sql } from './_lib/db.js';
import { currentUser, error, handle, json } from './_lib/http.js';

/*
 * The whole app state of a user is one JSON document with a version number.
 * Writes must send the version they started from; a mismatch returns 409 with
 * the server copy so the client can merge and retry.
 */

const MAX_BYTES = 4 * 1024 * 1024;

function looksLikeAppData(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  return ['profiles', 'entries', 'redeemed', 'drafts'].every((key) => Array.isArray(data[key]));
}

export function GET(request: Request): Promise<Response> {
  return handle(request, async () => {
    const user = await currentUser(request);
    if (!user) return error('unauthorized', 401);
    const rows = await sql()`SELECT data, version FROM user_data WHERE user_id = ${user.id}`;
    const row = rows[0] as { data: unknown; version: number } | undefined;
    return json({ data: row?.data ?? null, version: row?.version ?? 0 });
  });
}

export function PUT(request: Request): Promise<Response> {
  return handle(request, async () => {
    const user = await currentUser(request);
    if (!user) return error('unauthorized', 401);
    const text = await request.text();
    if (text.length > MAX_BYTES) return error('too_large', 413);
    let body: { data?: unknown; baseVersion?: unknown };
    try {
      body = JSON.parse(text);
    } catch {
      return error('invalid_json', 400);
    }
    if (!looksLikeAppData(body.data) || typeof body.baseVersion !== 'number') return error('invalid_data', 400);

    const db = sql();
    const payload = JSON.stringify(body.data);
    const rows =
      body.baseVersion === 0
        ? await db`
            INSERT INTO user_data (user_id, data, version) VALUES (${user.id}, ${payload}::jsonb, 1)
            ON CONFLICT (user_id) DO NOTHING RETURNING version`
        : await db`
            UPDATE user_data SET data = ${payload}::jsonb, version = version + 1, updated_at = now()
            WHERE user_id = ${user.id} AND version = ${body.baseVersion} RETURNING version`;
    const saved = rows[0] as { version: number } | undefined;
    if (saved) return json({ version: saved.version });

    const current = await db`SELECT data, version FROM user_data WHERE user_id = ${user.id}`;
    const row = current[0] as { data: unknown; version: number } | undefined;
    return json({ error: 'conflict', data: row?.data ?? null, version: row?.version ?? 0 }, 409);
  });
}
