import { createHash } from 'node:crypto';

/**
 * Minimal in-process rate limiter for the KYC challenge/session endpoints.
 *
 * Scope note: this is per-instance memory (works for the single-container
 * deployment this app ships as). A multi-replica deployment should move the
 * counter into the shared database — the interface stays the same.
 */

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CHALLENGES_PER_WINDOW = 5;
const MAX_SESSIONS_PER_WINDOW = 5;

const buckets = new Map<string, { count: number; resetAt: number }>();

const keyOf = (parts: readonly string[]): string =>
  createHash('sha256').update(parts.join('|')).digest('hex');

const consume = (key: string, max: number): boolean => {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (bucket.count >= max) {
    return false;
  }
  bucket.count += 1;
  return true;
};

// Opportunistic cleanup so long-lived processes do not grow the map unboundedly.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}, WINDOW_MS).unref?.();

export const allowKycChallenge = (userId: string, ip: string): boolean =>
  consume(keyOf(['challenge', userId, ip]), MAX_CHALLENGES_PER_WINDOW);

export const allowKycSession = (userId: string, ip: string): boolean =>
  consume(keyOf(['session', userId, ip]), MAX_SESSIONS_PER_WINDOW);
