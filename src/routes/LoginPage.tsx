import { useState } from 'react';
import type { FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Link, useNavigate } from 'react-router-dom';
import FieldTooltip, { validateEmailField } from './FieldTooltip';
import type { FieldError } from './FieldTooltip';
import PasswordField from './PasswordField';
import { getSupabaseClient } from '../lib/supabaseClient';
import { checkLoginRateLimit } from '../lib/authApi';

function validate(email: string, password: string): FieldError | null {
  const emailError = validateEmailField(email);
  if (emailError) return { field: 'email', message: emailError };
  if (password.length === 0) return { field: 'password', message: 'Password is required' };
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
  const [fieldError, setFieldError] = useState<FieldError | null>(null);

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
    <main className="auth-page login-page">
      <div className="login-card">
        <h1 className="login-title">Welcome</h1>
        <p className="login-subtitle">Sign in to your account</p>
        <form className="login-form" data-testid="login-form" noValidate onSubmit={handleSubmit}>
          <div className="login-field">
            {fieldError?.field === 'email' && <FieldTooltip message={fieldError.message} testId="login-error" />}
            <input
              id="login-email"
              type="email"
              className="login-input"
              data-testid="login-email-input"
              placeholder="Email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setFieldError(null);
              }}
              disabled={submitting}
              autoComplete="email"
            />
            <label htmlFor="login-email" className="login-label">Email</label>
          </div>
          <PasswordField
            id="login-password"
            testId="login-password-input"
            value={password}
            onChange={(value) => {
              setPassword(value);
              setFieldError(null);
            }}
            errorMessage={fieldError?.field === 'password' ? fieldError.message : undefined}
            errorTestId="login-error"
            disabled={submitting}
            autoComplete="current-password"
          />
          <Link to="/forgot-password" className="login-forgot" data-testid="login-forgot-password-link">
            Forgot your password?
          </Link>
          <div className="login-submit-wrap">
            {error && <FieldTooltip message={error} testId="login-error" />}
            <button type="submit" className="login-submit-button" data-testid="login-submit-button" disabled={submitting}>
              {submitting ? 'Logging in…' : 'Log in'}
            </button>
          </div>
        </form>
        <p className="login-footer">
          Don't have an account? <Link to="/signup" data-testid="login-signup-link">Sign up</Link>
        </p>
      </div>
    </main>
  );
}
