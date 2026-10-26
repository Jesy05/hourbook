import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/* Password hashing with scrypt and opaque session tokens (only their hash is stored). */

const KEY_LENGTH = 64;
const COST = 16384;

function scryptAsync(password: string, salt: Buffer, cost: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { N: cost, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

/** Returns "scrypt$N$salt$hash" with base64 parts. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, COST);
  return `scrypt$${COST}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, cost, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !cost || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await scryptAsync(password, Buffer.from(salt, 'base64'), Number(cost));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
