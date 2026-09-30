import { useState } from 'react';
import type { FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Link } from 'react-router-dom';
import FieldTooltip, { validateEmailField } from './FieldTooltip';
import BackToLoginButton from './BackToLoginButton';
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
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const emailError = validateEmailField(email);
    if (emailError) {
      setError(null);
      setFieldError(emailError);
      return;
    }

    setError(null);
    setFieldError(null);
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
      <main className="auth-page login-page">
        <div className="login-card">
          <h1 className="login-title">Check your email</h1>
          <p className="login-message" data-testid="forgot-password-info">
            If an account exists for {email}, we sent a link to reset the password.
          </p>
          <div className="login-footer login-footer-spaced">
            <BackToLoginButton testId="forgot-password-login-link" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page login-page">
      <div className="login-card">
        <h1 className="login-title">Reset password</h1>
        <p className="login-subtitle">We'll email you a reset link</p>
        <form className="login-form" data-testid="forgot-password-form" noValidate onSubmit={handleSubmit}>
          <div className="login-field">
            {fieldError && <FieldTooltip message={fieldError} testId="forgot-password-error" />}
            <input
              id="forgot-password-email"
              type="email"
              className="login-input"
              data-testid="forgot-password-email-input"
              placeholder="Email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setFieldError(null);
              }}
              disabled={submitting}
              autoComplete="email"
            />
            <label htmlFor="forgot-password-email" className="login-label">Email</label>
          </div>
          <div className="login-submit-wrap">
            {error && <FieldTooltip message={error} testId="forgot-password-error" />}
            <button
              type="submit"
              className="login-submit-button"
              data-testid="forgot-password-submit-button"
              disabled={submitting}
            >
              {submitting ? 'Sending…' : 'Send reset link'}
            </button>
          </div>
        </form>
        <p className="login-footer">
          <BackToLoginButton testId="forgot-password-back-link" />
        </p>
      </div>
    </main>
  );
}
