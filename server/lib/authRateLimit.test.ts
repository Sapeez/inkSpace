import test from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter, loginRateLimitKey } from './authRateLimit.js';

test('allows attempts up to the configured max within the window', () => {
  const limiter = new RateLimiter({ maxAttempts: 3, windowMs: 1000 });
  const now = 1_000_000;
  assert.equal(limiter.check('a', now).allowed, true);
  assert.equal(limiter.check('a', now + 10).allowed, true);
  assert.equal(limiter.check('a', now + 20).allowed, true);
});

test('blocks the attempt after the max is reached within the window, with a retryAfterSeconds', () => {
  const limiter = new RateLimiter({ maxAttempts: 2, windowMs: 1000 });
  const now = 1_000_000;
  assert.equal(limiter.check('a', now).allowed, true);
  assert.equal(limiter.check('a', now + 10).allowed, true);

  const blocked = limiter.check('a', now + 20);
  assert.equal(blocked.allowed, false);
  assert.ok(typeof blocked.retryAfterSeconds === 'number' && blocked.retryAfterSeconds > 0);
});

test('allows again once the window has fully elapsed', () => {
  const limiter = new RateLimiter({ maxAttempts: 1, windowMs: 1000 });
  const now = 1_000_000;
  assert.equal(limiter.check('a', now).allowed, true);
  assert.equal(limiter.check('a', now + 500).allowed, false);
  assert.equal(limiter.check('a', now + 1001).allowed, true);
});

test('tracks separate keys independently — one identifier being limited does not affect another', () => {
  const limiter = new RateLimiter({ maxAttempts: 1, windowMs: 1000 });
  const now = 1_000_000;
  assert.equal(limiter.check('a', now).allowed, true);
  assert.equal(limiter.check('a', now + 1).allowed, false);
  assert.equal(limiter.check('b', now + 1).allowed, true);
});

test('reset() clears a key so its next attempt is allowed immediately', () => {
  const limiter = new RateLimiter({ maxAttempts: 1, windowMs: 1000 });
  const now = 1_000_000;
  assert.equal(limiter.check('a', now).allowed, true);
  assert.equal(limiter.check('a', now + 1).allowed, false);
  limiter.reset('a');
  assert.equal(limiter.check('a', now + 2).allowed, true);
});

test('loginRateLimitKey normalizes email case/whitespace so the same person cannot dodge the limit with a trivial variant', () => {
  assert.equal(loginRateLimitKey('1.2.3.4', 'Foo@Example.com'), loginRateLimitKey('1.2.3.4', ' foo@example.com '));
  assert.notEqual(loginRateLimitKey('1.2.3.4', 'foo@example.com'), loginRateLimitKey('5.6.7.8', 'foo@example.com'));
});
