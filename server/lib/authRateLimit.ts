export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export interface RateLimiterOptions {
  maxAttempts: number;
  windowMs: number;
}

// In-memory only — fine for this app's single-instance deployment
// (`agents/skills/deployment.md`); a multi-instance deployment would need a
// shared store (e.g. Redis) instead, which is out of scope here.
export class RateLimiter {
  private readonly attemptsByKey = new Map<string, number[]>();

  constructor(private readonly options: RateLimiterOptions) {}

  check(key: string, now: number = Date.now()): RateLimitResult {
    const windowStart = now - this.options.windowMs;
    const attempts = (this.attemptsByKey.get(key) ?? []).filter((timestamp) => timestamp > windowStart);

    if (attempts.length >= this.options.maxAttempts) {
      this.attemptsByKey.set(key, attempts);
      const oldestAttempt = attempts[0] ?? now;
      return { allowed: false, retryAfterSeconds: Math.ceil((oldestAttempt + this.options.windowMs - now) / 1000) };
    }

    attempts.push(now);
    this.attemptsByKey.set(key, attempts);
    return { allowed: true };
  }

  reset(key: string): void {
    this.attemptsByKey.delete(key);
  }
}

// LG5: 5 attempts per 15 minutes per (IP, email) pair — this counts every
// attempt through this gate, not just failed ones, because the actual
// credential check happens client-side directly against Supabase Auth
// (`server/routes/auth.ts`'s comment) — this server never learns whether the
// login that followed actually succeeded.
export const loginRateLimiter = new RateLimiter({ maxAttempts: 5, windowMs: 15 * 60 * 1000 });

export function loginRateLimitKey(ip: string, email: string): string {
  return `${ip}:${email.trim().toLowerCase()}`;
}
