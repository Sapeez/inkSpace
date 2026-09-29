import { API_BASE } from './http';

export interface LoginRateLimitResult {
  allowed: boolean;
  message?: string;
  retryAfterSeconds?: number;
}

function extractString(body: unknown, key: string): string | undefined {
  if (typeof body === 'object' && body !== null && key in body) {
    const value = (body as Record<string, unknown>)[key];
    if (typeof value === 'string') return value;
  }
  return undefined;
}

function extractNumber(body: unknown, key: string): number | undefined {
  if (typeof body === 'object' && body !== null && key in body) {
    const value = (body as Record<string, unknown>)[key];
    if (typeof value === 'number') return value;
  }
  return undefined;
}

// LG5: called by `LoginPage.tsx` before `supabase.auth.signInWithPassword` —
// a 429 here means the flow stops before ever touching Supabase. This
// bypasses `http.ts`'s `request()` (which throws on any non-2xx) because a
// 429 is an expected, meaningful outcome here, not an error to propagate.
export async function checkLoginRateLimit(email: string): Promise<LoginRateLimitResult> {
  const response = await fetch(`${API_BASE}/api/auth/login-attempt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  if (response.status === 429) {
    const body: unknown = await response.json().catch(() => ({}));
    const retryAfterSeconds = extractNumber(body, 'retryAfterSeconds');
    return {
      allowed: false,
      message: extractString(body, 'message') ?? 'Too many login attempts. Please try again later.',
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    };
  }

  if (!response.ok) {
    throw new Error('Unable to verify login attempt rate — please try again.');
  }

  return { allowed: true };
}
