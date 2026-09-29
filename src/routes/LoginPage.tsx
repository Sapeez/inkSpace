import { useState } from 'react';
import type { FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Link, useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabaseClient';
import { checkLoginRateLimit } from '../lib/authApi';

function validate(email: string, password: string): string | null {
  if (email.trim().length === 0) return 'Email is required';
  if (password.length === 0) return 'Password is required';
  return null;
}

interface LoginPageProps {
  // Testability seam only — every real call site (`App.jsx`) renders
  // `<LoginPage />` with no props, so this defaults to the real client.
  // Node 20's `node --test` has no ES module mocking, so this is what lets
  // `LoginPage.test.tsx` substitute a fake without a real Supabase project
  // or hand-rolling GoTrue's wire response shape.
  auth?: Pick<SupabaseClient['auth'], 'signInWithPassword'>;
}

// LG1/LG3/LG4/LG5: email/password login only — Google sign-in (LG2) was
// dropped from this feature's scope (tasks-accounts-workspace.md task 1.1).
// Session persistence (LG3) is handled by supabase-js itself
// (`src/lib/session.ts`'s comment); logout (LG4) lives in the authenticated
// shell nav, not here.
export default function LoginPage({ auth = getSupabaseClient().auth }: LoginPageProps = {}) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validate(email, password);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      // LG5: gate before ever calling Supabase — see `server/routes/auth.ts`
      // for why the credential check itself can't be rate-limited here.
      const rateLimit = await checkLoginRateLimit(email);
      if (!rateLimit.allowed) {
        setError(rateLimit.message ?? 'Too many login attempts. Please try again later.');
        return;
      }

      const { error: signInError } = await auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(signInError.message);
        return;
      }

      navigate('/workspace');
    } catch (err) {
      // design req 3.3: a thrown network/server error (e.g. the rate-limit
      // check's own endpoint being unreachable) must still surface inline,
      // not leave the form silently reverting with no explanation.
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Log in</h1>
        <form className="auth-form" data-testid="login-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            Email
            <input
              type="email"
              className="auth-input"
              data-testid="login-email-input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={submitting}
              autoComplete="email"
            />
          </label>
          <label className="auth-field">
            Password
            <input
              type="password"
              className="auth-input"
              data-testid="login-password-input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting}
              autoComplete="current-password"
            />
          </label>
          {error && (
            <span className="auth-error" role="alert" data-testid="login-error">
              {error}
            </span>
          )}
          <button type="submit" className="auth-submit-button" data-testid="login-submit-button" disabled={submitting}>
            {submitting ? 'Logging in…' : 'Log in'}
          </button>
        </form>
        <p className="auth-links">
          <Link to="/forgot-password" data-testid="login-forgot-password-link">
            Forgot password?
          </Link>
        </p>
        <p className="auth-links">
          Don't have an account? <Link to="/signup" data-testid="login-signup-link">Sign up</Link>
        </p>
      </div>
    </main>
  );
}
