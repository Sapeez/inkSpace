import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import { getSupabaseClient } from '../lib/supabaseClient';
import { useSession } from '../lib/session';
import ConfirmModal from './ConfirmModal.jsx';
import { deleteAccount as deleteAccountApi } from '../lib/accountApi';
import { validatePasswordPolicy } from '../lib/passwordPolicy';
import PasswordField from '../routes/PasswordField';
import FieldTooltip from '../routes/FieldTooltip';
import Toast from './Toast';

// Not a real value any caller would pass — lets `sessionOverride === NOT_SET`
// distinguish "test didn't pass this prop, use the real hook" from "test
// explicitly wants the session treated as null/signed-out".
const NOT_SET = Symbol('not-set');

// design req 3.3 / typescript-standard.md §2.4: exact confirmation copy as a
// typed constant, exported so `SettingsPage.test.tsx` asserts against this
// same object rather than a second, independently hand-typed copy that could
// drift from it silently.
export const DELETE_ACCOUNT_COPY = {
  title: 'Delete your account?',
  message: 'This permanently deletes your account, your workspace, and every file in it. This cannot be undone.',
} as const;

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  // Testability seam only — see the matching comment on SignupPage.tsx/
  // LoginPage.tsx. `deleteAccount` is injected separately since it isn't a
  // method on the Supabase client (it's this app's own `/api/account` call).
  auth?: Pick<SupabaseClient['auth'], 'updateUser' | 'signOut'>;
  deleteAccount?: () => Promise<void>;
  // Testability seam for the email display: `useSession()` talks to the real
  // Supabase client, which `SettingsModal.test.tsx` has no other way to hand a
  // populated session to. Left unset, the real hook is used.
  sessionOverride?: Session | null | typeof NOT_SET;
}

// Opens over the workspace (no route of its own). Sections are separated by
// dividers: email (read-only) / security / danger zone (design req 3.3).
// Split so nothing (Supabase client, form state) exists
// while the modal is closed — and every opening starts from a clean slate.
export default function SettingsModal(props: SettingsModalProps) {
  if (!props.open) return null;
  return <SettingsModalContent {...props} />;
}

function SettingsModalContent({
  onClose,
  auth = getSupabaseClient().auth,
  deleteAccount = deleteAccountApi,
  sessionOverride = NOT_SET,
}: SettingsModalProps) {
  const navigate = useNavigate();
  const { session: hookSession } = useSession();
  const session = sessionOverride === NOT_SET ? hookSession : sessionOverride;

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  // Same tooltip-on-the-offending-field behavior as the signup form.
  const [passwordError, setPasswordError] = useState<{ field: 'new' | 'confirm' | 'submit'; message: string } | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const email = session?.user.email ?? '';

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !deleteModalOpen) onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [deleteModalOpen, onClose]);

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordSuccess(false);
    const policyError = validatePasswordPolicy(newPassword);
    if (policyError) {
      setPasswordError({ field: 'new', message: policyError });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError({ field: 'confirm', message: 'Passwords do not match' });
      return;
    }

    setPasswordError(null);
    setPasswordSubmitting(true);
    try {
      const { error } = await auth.updateUser({ password: newPassword });
      if (error) {
        setPasswordError({ field: 'submit', message: error.message });
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
    <>
      <div
        className="modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        data-testid="settings-modal"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !deleteModalOpen) onClose();
        }}
      >
        <div className="settings-modal">
          <header className="settings-modal-header">
            <h2 id="settings-modal-title" className="settings-modal-title">
              Settings
            </h2>
            <button
              type="button"
              className="settings-modal-close"
              aria-label="Close settings"
              data-testid="settings-close-button"
              onClick={onClose}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </header>

          <div className="settings-modal-body">
            <section className="settings-section">
              <h3>Email</h3>
              <label className="auth-field">
                Your account email
                <input
                  type="email"
                  className="auth-input"
                  data-testid="settings-email-input"
                  value={email}
                  disabled
                  readOnly
                />
              </label>
            </section>

            <hr className="settings-divider" />

            <section className="settings-section">
              <h3>Change password</h3>
              <form className="settings-form settings-password-form" data-testid="settings-password-form" noValidate onSubmit={handlePasswordSubmit}>
                <PasswordField
                  id="settings-new-password"
                  testId="settings-new-password-input"
                  label="New password"
                  value={newPassword}
                  onChange={(value) => {
                    setNewPassword(value);
                    setPasswordError(null);
                    setPasswordSuccess(false);
                  }}
                  errorMessage={passwordError?.field === 'new' ? passwordError.message : undefined}
                  errorTestId="settings-password-error"
                  disabled={passwordSubmitting}
                  autoComplete="new-password"
                />
                <PasswordField
                  id="settings-confirm-password"
                  testId="settings-confirm-password-input"
                  label="Confirm new password"
                  value={confirmPassword}
                  onChange={(value) => {
                    setConfirmPassword(value);
                    setPasswordError(null);
                    setPasswordSuccess(false);
                  }}
                  errorMessage={passwordError?.field === 'confirm' ? passwordError.message : undefined}
                  errorTestId="settings-password-error"
                  disabled={passwordSubmitting}
                  autoComplete="new-password"
                />
                <div className="settings-submit-wrap">
                  {passwordError?.field === 'submit' && (
                    <FieldTooltip message={passwordError.message} testId="settings-password-error" />
                  )}
                  <button
                    type="submit"
                    className="auth-submit-button"
                    data-testid="settings-password-save-button"
                    disabled={passwordSubmitting}
                  >
                    {passwordSubmitting ? 'Saving…' : 'Update password'}
                  </button>
                </div>
              </form>
            </section>

            <hr className="settings-divider" />

            <section className="settings-section settings-danger-zone">
              <h3>Danger zone</h3>
              <button
                type="button"
                className="settings-delete-account-button"
                data-testid="settings-delete-account-button"
                onClick={() => setDeleteModalOpen(true)}
              >
                Delete account
              </button>
            </section>
          </div>
        </div>
      </div>

      {passwordSuccess && (
        <Toast
          message="Password updated successfully"
          testId="settings-password-success"
          onDismiss={() => setPasswordSuccess(false)}
        />
      )}

      <ConfirmModal
        open={deleteModalOpen}
        variant="card"
        confirmLabel="Delete"
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
    </>
  );
}
