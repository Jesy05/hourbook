import { afterEach, describe, expect, it } from 'vitest';
import { hashPassword, hashToken, newSessionToken, verifyPassword } from './crypto.js';
import { emailAllowed, handle, normalizeEmail } from './http.js';

describe('passwords', () => {
  it('verifies the right password and rejects others', async () => {
    const stored = await hashPassword('correct horse battery');
    expect(stored.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse battery', stored)).toBe(true);
    expect(await verifyPassword('wrong password', stored)).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('rejects malformed stored hashes', async () => {
    expect(await verifyPassword('x', 'plain-text')).toBe(false);
  });
});

describe('session tokens', () => {
  it('are random and stored only as a hash', () => {
    const a = newSessionToken();
    expect(a).not.toBe(newSessionToken());
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a)).not.toContain(a);
  });
});

describe('request guards', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it('normalizes emails', () => {
    expect(normalizeEmail('  Jesy@Example.COM ')).toBe('jesy@example.com');
    expect(normalizeEmail('not-an-email')).toBeNull();
    expect(normalizeEmail(42)).toBeNull();
  });

  it('limits sign-ups to ALLOWED_EMAILS when set', () => {
    delete process.env.ALLOWED_EMAILS;
    expect(emailAllowed('anyone@example.com')).toBe(true);
    process.env.ALLOWED_EMAILS = 'a@example.com, B@example.com';
    expect(emailAllowed('b@example.com')).toBe(true);
    expect(emailAllowed('c@example.com')).toBe(false);
  });

  it('answers 503 when the database is not configured', async () => {
    delete process.env.DATABASE_URL;
    const res = await handle(new Request('http://x/api/auth/me'), async () => new Response('never'));
    expect(res.status).toBe(503);
  });

  it('refuses writes that are not JSON', async () => {
    process.env.DATABASE_URL = 'postgres://user:pass@localhost/db';
    const res = await handle(
      new Request('http://x/api/auth/login', { method: 'POST', body: 'email=a', headers: { 'content-type': 'application/x-www-form-urlencoded' } }),
      async () => new Response('never'),
    );
    expect(res.status).toBe(415);
  });
});
