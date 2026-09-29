import { Router } from 'express';
import type { Request, Response } from 'express';
import { loginRateLimiter, loginRateLimitKey } from '../lib/authRateLimit.js';

const router = Router();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// LG5: the actual credential check happens entirely client-side, directly
// against Supabase Auth via the anon client (`src/lib/supabaseClient.ts`) —
// this server never sees a password. `LoginPage.tsx` calls this route first,
// before `supabase.auth.signInWithPassword`, purely to throttle repeated
// attempts; a 204 here is not itself proof of a valid login.
router.post('/login-attempt', (req: Request, res: Response) => {
  const { email } = req.body as { email?: unknown };
  if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
    res.status(400).json({ message: 'A valid email address is required' });
    return;
  }

  const key = loginRateLimitKey(req.ip ?? 'unknown', email);
  const result = loginRateLimiter.check(key);
  if (!result.allowed) {
    res.status(429).json({
      message: 'Too many login attempts. Please try again later.',
      retryAfterSeconds: result.retryAfterSeconds,
    });
    return;
  }

  res.status(204).end();
});

export default router;
