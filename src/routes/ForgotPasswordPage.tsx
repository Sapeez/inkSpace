import { useState } from 'react';
import type { FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Link } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabaseClient';

interface ForgotPasswordPageProps {
  // Testability seam only — every real call site (`App.jsx`) renders
  // `<ForgotPasswordPage />` with no props, so this defaults to the real
  // client. Same reasoning as `LoginPage.tsx`/`SignupPage.tsx`.
  auth?: Pick<SupabaseClient['auth'], 'resetPasswordForEmail'>;
}

// PR1: entry point is the "Forgot password?" link on `LoginPage.tsx`.
// `resetPasswordForEmail` is treated as always-succeeding from the UI's
// perspective (no "no account with that email" branch) so this page can't be
// used to enumerate which emails have accounts.
export default function ForgotPasswordPage({ auth = getSupabaseClient().auth }: ForgotPasswordPageProps = {}) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (email.trim().length === 0) {
      setError('Email is required');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined;
      const { error: resetError } = await auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined);
      if (resetError) {
        setError(resetError.message);
        return;
      }
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Check your email</h1>
          <p data-testid="forgot-password-info">
            If an account exists for {email}, we sent a link to reset the password.
          </p>
          <p className="auth-links">
            <Link to="/login" data-testid="forgot-password-login-link">
              Back to login
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Reset your password</h1>
        <form className="auth-form" data-testid="forgot-password-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            Email
            <input
              type="email"
              className="auth-input"
              data-testid="forgot-password-email-input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={submitting}
              autoComplete="email"
            />
          </label>
          {error && (
            <span className="auth-error" role="alert" data-testid="forgot-password-error">
              {error}
            </span>
          )}
          <button
            type="submit"
            className="auth-submit-button"
            data-testid="forgot-password-submit-button"
            disabled={submitting}
          >
            {submitting ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
        <p className="auth-links">
          <Link to="/login" data-testid="forgot-password-back-link">
            Back to login
          </Link>
        </p>
      </div>
    </main>
  );
}
