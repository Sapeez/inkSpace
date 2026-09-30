import { useState } from 'react';
import type { FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Link } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabaseClient';
import { validatePasswordPolicy } from '../lib/passwordPolicy';
import { parseAuthLinkError } from '../lib/authLinkError';


interface ResetPasswordPageProps {
  // Testability seam only — every real call site (`App.jsx`) renders
  // `<ResetPasswordPage />` with no props, so these default to the real
  // client/location. Same reasoning as `LoginPage.tsx`/`SignupPage.tsx`.
  auth?: Pick<SupabaseClient['auth'], 'updateUser'>;
  locationHash?: string;
  locationSearch?: string;
}

export default function ResetPasswordPage({
  auth = getSupabaseClient().auth,
  locationHash = typeof window !== 'undefined' ? window.location.hash : '',
  locationSearch = typeof window !== 'undefined' ? window.location.search : '',
}: ResetPasswordPageProps = {}) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const linkError = parseAuthLinkError(locationHash, locationSearch, 'This reset link is invalid or has expired.');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const policyError = validatePasswordPolicy(password);
    if (policyError) {
      setError(policyError);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const { error: updateError } = await auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      // PR3: supabase-js's own guarantee — the old password stops working the
      // moment this call succeeds, nothing further to do here.
      setSuccess(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (linkError) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Reset link expired</h1>
          <p className="auth-error" role="alert" data-testid="reset-password-link-error">
            {linkError}
          </p>
          <p className="auth-links">
            <Link to="/forgot-password" data-testid="reset-password-retry-link">
              Request a new reset link
            </Link>
          </p>
        </div>
      </main>
    );
  }

  if (success) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Password updated</h1>
          <p data-testid="reset-password-success">
            Your password has been reset. You can now log in with your new password.
          </p>
          <p className="auth-links">
            <Link to="/login" data-testid="reset-password-login-link">
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
        <h1>Choose a new password</h1>
        <form className="auth-form" data-testid="reset-password-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            New password
            <input
              type="password"
              className="auth-input"
              data-testid="reset-password-password-input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting}
              autoComplete="new-password"
            />
          </label>
          <label className="auth-field">
            Confirm password
            <input
              type="password"
              className="auth-input"
              data-testid="reset-password-confirm-input"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={submitting}
              autoComplete="new-password"
            />
          </label>
          {error && (
            <span className="auth-error" role="alert" data-testid="reset-password-error">
              {error}
            </span>
          )}
          <button
            type="submit"
            className="auth-submit-button"
            data-testid="reset-password-submit-button"
            disabled={submitting}
          >
            {submitting ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </main>
  );
}
