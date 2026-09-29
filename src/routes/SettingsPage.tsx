import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session, SupabaseClient, UserIdentity } from '@supabase/supabase-js';
import { Link, useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabaseClient';
import { useSession } from '../lib/session';
import ConfirmModal from '../modals/ConfirmModal.jsx';
import { deleteAccount as deleteAccountApi } from '../lib/accountApi';

// Not a real value any caller would pass — lets `sessionOverride === NOT_SET`
// distinguish "test didn't pass this prop, use the real hook" from "test
// explicitly wants the session treated as null/signed-out".
const NOT_SET = Symbol('not-set');

const MIN_PASSWORD_LENGTH = 6;

// design req 3.3 / typescript-standard.md §2.4: exact confirmation copy as a
// typed constant, exported so `SettingsPage.test.tsx` asserts against this
// same object rather than a second, independently hand-typed copy that could
// drift from it silently.
export const DELETE_ACCOUNT_COPY = {
  title: 'Delete your account?',
  message: 'This permanently deletes your account, your workspace, and every file in it. This cannot be undone.',
} as const;

interface SettingsPageProps {
  // Testability seam only — see the matching comment on SignupPage.tsx/
  // LoginPage.tsx. `deleteAccount` is injected separately since it isn't a
  // method on the Supabase client (it's this app's own `/api/account` call).
  auth?: Pick<SupabaseClient['auth'], 'updateUser' | 'getUserIdentities' | 'signOut'>;
  deleteAccount?: () => Promise<void>;
  // Testability seam for the profile/email pre-fill (US1/US2): `useSession()`
  // talks to the real Supabase client, which `SettingsPage.test.tsx` has no
  // other way to hand a populated session to. Left unset, the real hook is
  // used, exactly like every actual call site.
  sessionOverride?: Session | null | typeof NOT_SET;
}

// US1-US5: grouped by concern (profile / security / danger zone), not a flat
// list (design req 3.3). Email re-verification (US2) reuses task 2.3's
// `VerifyEmailPage.tsx` flow — Supabase sends that link automatically on an
// email change, this page doesn't trigger it separately.
export default function SettingsPage({
  auth = getSupabaseClient().auth,
  deleteAccount = deleteAccountApi,
  sessionOverride = NOT_SET,
}: SettingsPageProps = {}) {
  const navigate = useNavigate();
  const { session: hookSession } = useSession();
  const session = sessionOverride === NOT_SET ? hookSession : sessionOverride;

  const [displayName, setDisplayName] = useState('');
  const [displayNameTouched, setDisplayNameTouched] = useState(false);
  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);

  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const [identities, setIdentities] = useState<UserIdentity[] | null>(null);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // US1/US2: `useSession()`'s `session` starts `null` and only resolves
  // inside its own effect (session.ts) — a `useState` initializer reading it
  // would deterministically see `null` on every mount. Synced here instead,
  // and gated on "not yet touched" so a session update that resolves while
  // the user is mid-edit doesn't clobber what they've typed.
  useEffect(() => {
    if (session && !displayNameTouched) {
      setDisplayName((session.user.user_metadata?.display_name as string | undefined) ?? '');
    }
    if (session && !emailTouched) {
      setEmail(session.user.email ?? '');
    }
  }, [session, displayNameTouched, emailTouched]);

  const [identitiesError, setIdentitiesError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    auth
      .getUserIdentities()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setIdentitiesError(error.message);
          return;
        }
        setIdentities(data?.identities ?? []);
      })
      .catch((err: unknown) => {
        if (active) setIdentitiesError(err instanceof Error ? err.message : 'Could not load sign-in methods.');
      });
    return () => {
      active = false;
    };
  }, [auth]);

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileSuccess(false);
    if (displayName.trim().length === 0) {
      setProfileError('Required field');
      return;
    }

    setProfileError(null);
    setProfileSubmitting(true);
    try {
      const { error } = await auth.updateUser({ data: { display_name: displayName.trim() } });
      if (error) {
        setProfileError(error.message);
        return;
      }
      setProfileSuccess(true);
    } finally {
      setProfileSubmitting(false);
    }
  }

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailSuccess(false);
    if (email.trim().length === 0) {
      setEmailError('Required field');
      return;
    }

    setEmailError(null);
    setEmailSubmitting(true);
    try {
      const { error } = await auth.updateUser({ email: email.trim() });
      if (error) {
        setEmailError(error.message);
        return;
      }
      setEmailSuccess(true);
    } finally {
      setEmailSubmitting(false);
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordSuccess(false);
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setPasswordError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    setPasswordError(null);
    setPasswordSubmitting(true);
    try {
      const { error } = await auth.updateUser({ password: newPassword });
      if (error) {
        setPasswordError(error.message);
        return;
      }
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess(true);
    } finally {
      setPasswordSubmitting(false);
    }
  }

  async function handleDeleteConfirm() {
    // Defense-in-depth against a double-click landing before React commits
    // the Confirm button's `disabled` state — same reasoning as
    // SaveModal.tsx's `handleConfirm` guard, but higher-stakes here since
    // this action is destructive and irreversible.
    if (deleteSubmitting) return;

    setDeleteError(null);
    setDeleteSubmitting(true);
    try {
      await deleteAccount();
      await auth.signOut();
      navigate('/signup');
    } catch (err) {
      // §4.8's "a completed save must leave the modal open, don't auto-close
      // on failure" applies just as much to a destructive confirmation — the
      // modal stays open so the error is visible right next to the action
      // that failed, and the user can retry or cancel deliberately.
      setDeleteError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setDeleteSubmitting(false);
    }
  }

  function handleDeleteCancel() {
    if (deleteSubmitting) return;
    setDeleteModalOpen(false);
    setDeleteError(null);
  }

  return (
    <main className="settings-page" data-testid="settings-page">
      <header className="settings-header">
        <Link to="/workspace" data-testid="settings-back-link">
          ← Back to workspace
        </Link>
        <h1>Settings</h1>
      </header>

      <section className="settings-section">
        <h2>Profile</h2>
        <form className="settings-form" data-testid="settings-profile-form" onSubmit={handleProfileSubmit}>
          <label className="auth-field">
            Display name
            <input
              type="text"
              className="auth-input"
              data-testid="settings-display-name-input"
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value);
                setDisplayNameTouched(true);
              }}
              disabled={profileSubmitting}
            />
          </label>
          {profileError && (
            <span className="auth-error" role="alert" data-testid="settings-profile-error">
              {profileError}
            </span>
          )}
          {profileSuccess && (
            <span className="settings-success" data-testid="settings-profile-success">
              Display name updated.
            </span>
          )}
          <button
            type="submit"
            className="auth-submit-button"
            data-testid="settings-profile-save-button"
            disabled={profileSubmitting}
          >
            {profileSubmitting ? 'Saving…' : 'Save'}
          </button>
        </form>
      </section>

      <section className="settings-section">
        <h2>Email</h2>
        <form className="settings-form" data-testid="settings-email-form" onSubmit={handleEmailSubmit}>
          <label className="auth-field">
            Email
            <input
              type="email"
              className="auth-input"
              data-testid="settings-email-input"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setEmailTouched(true);
              }}
              disabled={emailSubmitting}
              autoComplete="email"
            />
          </label>
          {emailError && (
            <span className="auth-error" role="alert" data-testid="settings-email-error">
              {emailError}
            </span>
          )}
          {emailSuccess && (
            <span className="settings-success" data-testid="settings-email-success">
              Check your new email address for a verification link before it takes effect.
            </span>
          )}
          <button
            type="submit"
            className="auth-submit-button"
            data-testid="settings-email-save-button"
            disabled={emailSubmitting}
          >
            {emailSubmitting ? 'Saving…' : 'Save'}
          </button>
        </form>
      </section>

      <section className="settings-section">
        <h2>Security</h2>
        <form className="settings-form" data-testid="settings-password-form" onSubmit={handlePasswordSubmit}>
          <label className="auth-field">
            New password
            <input
              type="password"
              className="auth-input"
              data-testid="settings-new-password-input"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              disabled={passwordSubmitting}
              autoComplete="new-password"
            />
          </label>
          <label className="auth-field">
            Confirm new password
            <input
              type="password"
              className="auth-input"
              data-testid="settings-confirm-password-input"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={passwordSubmitting}
              autoComplete="new-password"
            />
          </label>
          {passwordError && (
            <span className="auth-error" role="alert" data-testid="settings-password-error">
              {passwordError}
            </span>
          )}
          {passwordSuccess && (
            <span className="settings-success" data-testid="settings-password-success">
              Password updated.
            </span>
          )}
          <button
            type="submit"
            className="auth-submit-button"
            data-testid="settings-password-save-button"
            disabled={passwordSubmitting}
          >
            {passwordSubmitting ? 'Saving…' : 'Save'}
          </button>
        </form>

        <h3>Linked sign-in methods</h3>
        {identitiesError && (
          <span className="auth-error" role="alert" data-testid="settings-identities-error">
            {identitiesError}
          </span>
        )}
        <ul className="settings-identities-list" data-testid="settings-identities-list">
          {(identities ?? []).map((identity) => (
            <li key={identity.identity_id} className="settings-identity-item" data-testid="settings-identity-item">
              {identity.provider}
            </li>
          ))}
        </ul>
      </section>

      <section className="settings-section settings-danger-zone">
        <h2>Danger zone</h2>
        <button
          type="button"
          className="settings-delete-account-button"
          data-testid="settings-delete-account-button"
          onClick={() => setDeleteModalOpen(true)}
        >
          Delete account
        </button>
      </section>

      <ConfirmModal
        open={deleteModalOpen}
        title={DELETE_ACCOUNT_COPY.title}
        message={DELETE_ACCOUNT_COPY.message}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        disabled={deleteSubmitting}
        error={deleteError}
        testId="delete-account-modal"
        titleTestId="delete-account-modal-title"
        messageTestId="delete-account-modal-message"
        confirmTestId="delete-account-confirm-button"
        cancelTestId="delete-account-cancel-button"
        errorTestId="settings-delete-account-error"
      />
    </main>
  );
}
