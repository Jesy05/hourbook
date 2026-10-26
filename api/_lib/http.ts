import { hashToken, newSessionToken } from './crypto.js';
import { ensureSchema, isConfigured, sql } from './db.js';

/* Shared request helpers: JSON responses, cookies and the current session. */

export const SESSION_COOKIE = 'hb_session';
const REMEMBER_DAYS = 60;
const SHORT_SESSION_HOURS = 24;

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

export function error(code: string, status: number): Response {
  return json({ error: code }, status);
}

/** Runs a handler with the common checks: database configured, schema ready, JSON body on writes. */
export async function handle(request: Request, fn: () => Promise<Response>): Promise<Response> {
  if (!isConfigured()) return error('not_configured', 503);
  // Requiring JSON on writes blocks cross-site form posts (CSRF) on top of SameSite cookies.
  if (request.method !== 'GET' && !request.headers.get('content-type')?.includes('application/json')) {
    return error('bad_content_type', 415);
  }
  try {
    await ensureSchema();
    return await fn();
  } catch (e) {
    console.error(e);
    return error('server_error', 500);
  }
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function isSecure(request: Request): boolean {
  return new URL(request.url).protocol === 'https:';
}

function sessionCookie(request: Request, token: string, maxAgeSeconds: number | null): string {
  const parts = [`${SESSION_COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (maxAgeSeconds !== null) parts.push(`Max-Age=${maxAgeSeconds}`);
  if (isSecure(request)) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(request: Request): string {
  return sessionCookie(request, '', 0);
}

/** Creates a session. "Remember me" keeps it for 60 days; otherwise it ends with the browser or after 24 h. */
export async function createSession(request: Request, userId: string, remember: boolean): Promise<string> {
  const token = newSessionToken();
  const seconds = remember ? REMEMBER_DAYS * 86400 : SHORT_SESSION_HOURS * 3600;
  const expires = new Date(Date.now() + seconds * 1000);
  const db = sql();
  await db`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (${hashToken(token)}, ${userId}, ${expires.toISOString()})`;
  await db`DELETE FROM sessions WHERE user_id = ${userId} AND expires_at < now()`;
  return sessionCookie(request, token, remember ? seconds : null);
}

export async function currentUser(request: Request): Promise<{ id: string; email: string } | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  const rows = await sql()`
    SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${hashToken(token)} AND s.expires_at > now()`;
  const row = rows[0] as { id: string; email: string } | undefined;
  return row ?? null;
}

export async function deleteSession(request: Request): Promise<void> {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await sql()`DELETE FROM sessions WHERE token_hash = ${hashToken(token)}`;
}

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null;
}

/** When ALLOWED_EMAILS is set (comma separated), only those addresses can create an account. */
export function emailAllowed(email: string): boolean {
  const list = (process.env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.length === 0 || list.includes(email);
}
