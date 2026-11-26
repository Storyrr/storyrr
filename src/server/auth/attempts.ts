import "@tanstack/react-start/server-only";

/**
 * Counts failed attempts per key in memory (one process, like the rest of
 * Storyrr): after `max` failures within `windowMs`, the key waits for the
 * oldest to expire. For checks that reach a password, where better-auth's own
 * rate limit (its HTTP endpoints only) doesn't apply.
 */
export function createAttemptLimiter({ max, windowMs }: { max: number; windowMs: number }) {
  const failures = new Map<string, number[]>();
  const recent = (key: string, now: number) =>
    (failures.get(key) ?? []).filter((at) => now - at < windowMs);
  return {
    allowed(key: string, now = Date.now()): boolean {
      return recent(key, now).length < max;
    },
    failed(key: string, now = Date.now()): void {
      failures.set(key, [...recent(key, now), now]);
    },
    succeeded(key: string): void {
      failures.delete(key);
    },
  };
}

/** Linking a media-server account: five wrong passwords, then a ten-minute wait. */
export const linkAttempts = createAttemptLimiter({ max: 5, windowMs: 10 * 60_000 });
/** Same for the current password asked to change one's email. */
export const passwordAttempts = createAttemptLimiter({ max: 5, windowMs: 10 * 60_000 });
