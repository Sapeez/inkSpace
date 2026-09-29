import { useState } from 'react';
import type { FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Link, useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabaseClient';

const MIN_PASSWORD_LENGTH = 6;

function validate(email: string, password: string): string | null {
  if (email.trim().length === 0) return 'Email is required';
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  return null;
}

interface SignupPageProps {
  // Testability seam only — every real call site (`App.jsx`) renders
  // `<SignupPage />` with no props, so this defaults to the real client.
  // Node 20's `node --test` has no ES module mocking, so this is what lets
  // `SignupPage.test.tsx` substitute a fake without a real Supabase project
  // or hand-rolling GoTrue's wire response shape.
  auth?: Pick<SupabaseClient['auth'], 'signUp'>;
}

// SU1/SU3/SU5: email/password signup only — Google sign-in (SU2) and its
// auto-linking edge case (SU4/R1) were dropped from this feature's scope
// (tasks-accounts-workspace.md task 1.1). Workspace creation itself happens
// server-side (task 4.2's auto-create trigger), so there's no separate
// "create your workspace" step shown here.
export default function SignupPage({ auth = getSupabaseClient().auth }: SignupPageProps = {}) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmailNotice, setCheckEmailNotice] = useState(false);

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
      const { data, error: signUpError } = await auth.signUp({ email, password });
      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      // If the Supabase project requires email confirmation before issuing a
      // session, `data.session` is null here even on a successful signup —
      // EV1's verification flow (task 2.3) covers that case; this isn't a
      // failure, so it doesn't go through the error path.
      if (data.session) {
        navigate('/workspace');
      } else {
        setCheckEmailNotice(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (checkEmailNotice) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <h1>Check your email</h1>
          <p data-testid="signup-info">We sent a verification link to {email}. You can sign in once you've confirmed it.</p>
          <Link to="/login" data-testid="signup-login-link">
            Back to login
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>Create your account</h1>
        <form className="auth-form" data-testid="signup-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            Email
            <input
              type="email"
              className="auth-input"
              data-testid="signup-email-input"
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
              data-testid="signup-password-input"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting}
              autoComplete="new-password"
            />
          </label>
          {error && (
            <span className="auth-error" role="alert" data-testid="signup-error">
              {error}
            </span>
          )}
          <button type="submit" className="auth-submit-button" data-testid="signup-submit-button" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Sign up'}
          </button>
        </form>
        <p className="auth-links">
          Already have an account? <Link to="/login" data-testid="signup-login-link">Log in</Link>
        </p>
      </div>
    </main>
  );
}
