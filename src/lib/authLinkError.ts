// Shared by `ResetPasswordPage.tsx` (PR2) and `VerifyEmailPage.tsx` (EV3): a
// recovery/verification link Supabase considers invalid (already used or
// expired) redirects back with `error`/`error_code`/`error_description` in
// the URL hash (implicit flow) instead of establishing a session — this is
// Supabase's own single-use/time-limit enforcement, not something either
// page implements itself. A valid link instead has its tokens consumed
// automatically by the Supabase client's `detectSessionInUrl` before the
// page ever renders, leaving no error params to find.
export function parseAuthLinkError(hash: string, search: string, fallbackMessage: string): string | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  // `URLSearchParams` already decodes a `+` to a space per
  // `application/x-www-form-urlencoded`, so `error_description` needs no
  // further unescaping here.
  const errorDescription = params.get('error_description');
  if (errorDescription) return errorDescription;
  if (params.get('error') || params.get('error_code')) return fallbackMessage;
  return null;
}
