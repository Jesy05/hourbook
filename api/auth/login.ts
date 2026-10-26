import { verifyPassword } from '../_lib/crypto.js';
import { sql } from '../_lib/db.js';
import { createSession, error, handle, json, normalizeEmail, readJson } from '../_lib/http.js';

const MAX_FAILURES = 10;
const LOCK_MINUTES = 15;

// Used to spend the same time on unknown emails, so responses do not reveal which accounts exist.
const DUMMY_HASH = 'scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==';

export function POST(request: Request): Promise<Response> {
  return handle(request, async () => {
    const body = await readJson<{ email?: unknown; password?: unknown; remember?: unknown }>(request);
    const email = normalizeEmail(body?.email);
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!email || !password) return error('invalid_credentials', 401);

    const db = sql();
    const rows = await db`
      SELECT id, password_hash, failed_logins, locked_until > now() AS locked
      FROM users WHERE email = ${email}`;
    const user = rows[0] as { id: string; password_hash: string; failed_logins: number; locked: boolean | null } | undefined;
    if (!user) {
      await verifyPassword(password, DUMMY_HASH);
      return error('invalid_credentials', 401);
    }
    if (user.locked) return error('locked', 429);

    if (!(await verifyPassword(password, user.password_hash))) {
      const failures = user.failed_logins + 1;
      if (failures >= MAX_FAILURES) {
        await db`UPDATE users SET failed_logins = 0, locked_until = now() + make_interval(mins => ${LOCK_MINUTES}) WHERE id = ${user.id}`;
      } else {
        await db`UPDATE users SET failed_logins = ${failures} WHERE id = ${user.id}`;
      }
      return error('invalid_credentials', 401);
    }

    await db`UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ${user.id}`;
    const cookie = await createSession(request, user.id, body?.remember === true);
    return json({ email }, 200, { 'Set-Cookie': cookie });
  });
}
