import { useState } from 'react';
import type { FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Link, useNavigate } from 'react-router-dom';
import FieldTooltip, { validateEmailField } from './FieldTooltip';
import type { FieldError } from './FieldTooltip';
import { validatePasswordPolicy } from '../lib/passwordPolicy';
import PasswordField from './PasswordField';
import BackToLoginButton from './BackToLoginButton';
import { getSupabaseClient } from '../lib/supabaseClient';


function validate(email: string, password: string): FieldError | null {
  const emailError = validateEmailField(email);
  if (emailError) return { field: 'email', message: emailError };
  const passwordError = validatePasswordPolicy(password);
  if (passwordError) return { field: 'password', message: passwordError };
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
  const [fieldError, setFieldError] = useState<FieldError | null>(null);
  const [checkEmailNotice, setCheckEmailNotice] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validate(email, password);
    if (validationError) {
      setError(null);
      setFieldError(validationError);
      return;
    }

    setError(null);
    setFieldError(null);
    setSubmitting(true);
    try {
      // Supabase sends the confirmation mail itself (when "Confirm email" is on
      // in the project's Auth settings); `emailRedirectTo` makes its link land
      // on /verify-email in this app. That URL must be in the project's
      // allowed Redirect URLs.
      const emailRedirectTo = typeof window !== 'undefined' ? `${window.location.origin}/verify-email` : undefined;
      const { data, error: signUpError } = await auth.signUp({
        email,
        password,
        ...(emailRedirectTo ? { options: { emailRedirectTo } } : {}),
      });
      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      // With email confirmation on, Supabase doesn't error for an already
      // registered address (to avoid leaking which emails exist) — it returns
      // a user with an empty `identities` array instead, so detect that here.
      if (Array.isArray(data.user?.identities) && data.user.identities.length === 0) {
        setError('An account with this email already exists. Please log in instead.');
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
      <main className="auth-page login-page">
        <div className="login-card">
          <h1 className="login-title">Check your email</h1>
          <p className="login-message" data-testid="signup-info">
            We sent a verification link to {email}. You can sign in once you've confirmed it.
          </p>
          <div className="login-footer login-footer-spaced">
            <BackToLoginButton testId="signup-login-link" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page login-page">
      <div className="login-card">
        <h1 className="login-title">Sign up</h1>
        <p className="login-subtitle">Create your account</p>
        <form className="login-form" data-testid="signup-form" noValidate onSubmit={handleSubmit}>
          <div className="login-field">
            {fieldError?.field === 'email' && <FieldTooltip message={fieldError.message} testId="signup-error" />}
            <input
              id="signup-email"
              type="email"
              className="login-input"
              data-testid="signup-email-input"
              placeholder="Email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setFieldError(null);
              }}
              disabled={submitting}
              autoComplete="email"
            />
            <label htmlFor="signup-email" className="login-label">Email</label>
          </div>
          <PasswordField
            id="signup-password"
            testId="signup-password-input"
            value={password}
            onChange={(value) => {
              setPassword(value);
              setFieldError(null);
            }}
            errorMessage={fieldError?.field === 'password' ? fieldError.message : undefined}
            errorTestId="signup-error"
            disabled={submitting}
            autoComplete="new-password"
          />
          <div className="login-submit-wrap">
            {error && <FieldTooltip message={error} testId="signup-error" />}
            <button type="submit" className="login-submit-button" data-testid="signup-submit-button" disabled={submitting}>
              {submitting ? 'Creating account…' : 'Sign up'}
            </button>
          </div>
        </form>
        <p className="login-footer">
          Already have an account? <Link to="/login" data-testid="signup-login-link">Log in</Link>
        </p>
      </div>
    </main>
  );
}
