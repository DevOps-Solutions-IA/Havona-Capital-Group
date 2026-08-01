import * as argon2 from 'argon2';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'havona_session';
export const CSRF_COOKIE = 'havona_csrf';
export const hashPassword = (password: string) => argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 });
export const verifyPassword = async (hash: string, password: string) => argon2.verify(hash, password);
export const createOpaqueToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export function constantTimeTokenMatch(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashToken(token)); const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export type Principal = { id: string; email: string; name: string; roles: string[]; permissions: string[] };
