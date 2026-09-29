import { useState } from 'react';
import type { FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Link } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabaseClient';
import { parseAuthLinkError } from '../lib/authLinkError';

interface VerifyEmailPageProps {
  // Testability seam only — every real call site (`App.jsx`) renders
  // `<VerifyEmailPage />` with no props, so these default to the real
  // client/location. Same reasoning as `LoginPage.tsx`/`SignupPage.tsx`.
  auth?: Pick<SupabaseClient['auth'], 'resend'>;
  locationHash?: string;
  locationSearch?: string;
}

export default function VerifyEmailPage({
  auth = getSupabaseClient().auth,
  locationHash = typeof window !== 'undefined' ? window.location.hash : '',
  locationSearch = typeof window !== 'undefined' ? window.location.search : '',
}: VerifyEmailPageProps = {}) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const linkError = parseAuthLinkError(locationHash, locationSearch, 'This verification link is invalid or has expired.');

  async function handleResend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (email.trim().length === 0) {
      setError('Email is required');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      // EV3: this page is only ever reached via the signup-confirmation
      // link (task 3.3's email-change confirmation reuses the same
      // underlying `resend`/`updateUser` calls from `SettingsPage.tsx`
      // directly, not this component).
      const { error: resendError } = await auth.resend({ type: 'signup', email });
      if (resendError) {
        setError(resendError.message);
        return;
      }
      setResent(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (!linkError) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Email verified</h1>
          <p data-testid="verify-email-success">Your email address has been verified.</p>
          <p className="auth-links">
            <Link to="/workspace" data-testid="verify-email-workspace-link">
              Go to workspace
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Verification link expired</h1>
        <p className="auth-error" role="alert" data-testid="verify-email-link-error">
          {linkError}
        </p>
        {resent ? (
          <p data-testid="verify-email-resent">A new verification link has been sent to {email}.</p>
        ) : (
          <form className="auth-form" data-testid="verify-email-resend-form" onSubmit={handleResend}>
            <label className="auth-field">
              Email
              <input
                type="email"
                className="auth-input"
                data-testid="verify-email-email-input"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={submitting}
                autoComplete="email"
              />
            </label>
            {error && (
              <span className="auth-error" role="alert" data-testid="verify-email-error">
                {error}
              </span>
            )}
            <button
              type="submit"
              className="auth-submit-button"
              data-testid="verify-email-resend-button"
              disabled={submitting}
            >
              {submitting ? 'Sending…' : 'Resend verification email'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
