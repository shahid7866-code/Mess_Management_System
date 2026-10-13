import "server-only";

interface LoginAttemptBucket {
  count: number;
  expiresAt: number;
}

const ATTEMPT_LIMIT = 5;
const WINDOW_MS = 15 * 60 * 1000;
const buckets = new Map<string, LoginAttemptBucket>();

export function consumeLoginAttempt(key: string): boolean {
  const now = Date.now();

  if (buckets.size > 10_000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.expiresAt <= now) {
        buckets.delete(bucketKey);
      }
    }
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.expiresAt <= now) {
    buckets.set(key, { count: 1, expiresAt: now + WINDOW_MS });
    return true;
  }

  bucket.count += 1;
  return bucket.count <= ATTEMPT_LIMIT;
}

export function clearLoginAttempts(key: string): void {
  buckets.delete(key);
}