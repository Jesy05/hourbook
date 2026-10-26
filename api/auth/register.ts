import { hashPassword } from '../_lib/crypto.js';
import { sql } from '../_lib/db.js';
import { createSession, emailAllowed, error, handle, json, normalizeEmail, readJson } from '../_lib/http.js';


export function POST(request: Request): Promise<Response> {
  return handle(request, async () => {
    const body = await readJson<{ email?: unknown; password?: unknown; remember?: unknown }>(request);
    const email = normalizeEmail(body?.email);
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!email) return error('invalid_email', 400);
    if (password.length < 8 || password.length > 200) return error('weak_password', 400);
    if (!emailAllowed(email)) return error('not_allowed', 403);

    const db = sql();
    const rows = await db`
      INSERT INTO users (email, password_hash) VALUES (${email}, ${await hashPassword(password)})
      ON CONFLICT (email) DO NOTHING RETURNING id`;
    const user = rows[0] as { id: string } | undefined;
    if (!user) return error('email_taken', 409);
    const cookie = await createSession(request, user.id, body?.remember === true);
    return json({ email }, 201, { 'Set-Cookie': cookie });
  });
}
