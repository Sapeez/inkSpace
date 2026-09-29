import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabaseClient';
import { fetchWorkspace, changeWorkspace, fetchFolders, fetchAttachments } from '../lib/index.js';
import { deleteAccount as deleteAccountApi } from '../lib/accountApi';
import ConfirmModal from '../modals/ConfirmModal.jsx';

interface WorkspaceSettingsPageProps {
  // Testability seam only — see the matching comment on SettingsPage.tsx.
  auth?: Pick<SupabaseClient['auth'], 'signOut'>;
  fetchWorkspaceFn?: typeof fetchWorkspace;
  changeWorkspaceFn?: typeof changeWorkspace;
  fetchFoldersFn?: typeof fetchFolders;
  fetchAttachmentsFn?: typeof fetchAttachments;
  deleteAccount?: () => Promise<void>;
}

// WC1: workspace display name. There is no separate "workspace" resource in
// this 1:1 model beyond the row `server/services/workspaces.ts` already
// exposes via GET/PATCH /api/workspace — this page is just the UI for it.
export default function WorkspaceSettingsPage({
  auth = getSupabaseClient().auth,
  fetchWorkspaceFn = fetchWorkspace,
  changeWorkspaceFn = changeWorkspace,
  fetchFoldersFn = fetchFolders,
  fetchAttachmentsFn = fetchAttachments,
  deleteAccount = deleteAccountApi,
}: WorkspaceSettingsPageProps = {}) {
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [fileCount, setFileCount] = useState<number | null>(null);
  const [folderCount, setFolderCount] = useState<number | null>(null);
  const [countsError, setCountsError] = useState<string | null>(null);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (fetchWorkspaceFn() as Promise<{ displayName: string }>)
      .then((workspace) => {
        if (active) setDisplayName(workspace.displayName);
      })
      .catch((err: unknown) => {
        if (active) setLoadError(err instanceof Error ? err.message : 'Could not load workspace settings.');
      });
    return () => {
      active = false;
    };
  }, [fetchWorkspaceFn]);

  // WC2/WC3/R2: the delete confirmation must name what will be lost before
  // proceeding — counts are fetched fresh when the modal opens rather than
  // trusted from whatever was last loaded, since the workspace state can
  // change between page load and the user clicking Delete. Found in review:
  // Confirm must stay disabled until the counts fetch actually settles (one
  // way or the other) — otherwise a fast click could proceed past the "name
  // what will be lost" requirement before the real numbers ever render, and
  // a failure was previously swallowed with no visible sign it happened.
  async function openDeleteModal() {
    setDeleteError(null);
    setFileCount(null);
    setFolderCount(null);
    setCountsError(null);
    setDeleteModalOpen(true);
    try {
      const [files, folders] = await Promise.all([
        fetchAttachmentsFn({}) as Promise<unknown[]>,
        fetchFoldersFn() as Promise<unknown[]>,
      ]);
      setFileCount(files.length);
      setFolderCount(folders.length);
    } catch (err) {
      setCountsError(err instanceof Error ? err.message : 'Could not check exact file/folder counts.');
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess(false);
    if (displayName.trim().length === 0) {
      setError('Required field');
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const workspace = (await changeWorkspaceFn({ displayName: displayName.trim() })) as { displayName: string };
      setDisplayName(workspace.displayName);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update workspace name.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteConfirm() {
    if (deleteSubmitting) return;
    setDeleteError(null);
    setDeleteSubmitting(true);
    try {
      await deleteAccount();
      await auth.signOut();
      navigate('/signup');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setDeleteSubmitting(false);
    }
  }

  function handleDeleteCancel() {
    if (deleteSubmitting) return;
    setDeleteModalOpen(false);
    setDeleteError(null);
  }

  const countsKnown = fileCount !== null && folderCount !== null;
  const countsSettled = countsKnown || countsError !== null;
  const deleteMessage = countsKnown
    ? `This permanently deletes your workspace, including ${fileCount} file${fileCount === 1 ? '' : 's'} and ${folderCount} folder${folderCount === 1 ? '' : 's'}, and your account. This cannot be undone.`
    : countsError
      ? `We couldn't confirm exactly how many files and folders this will delete (${countsError}). This permanently deletes your workspace and your account, including everything in it. This cannot be undone.`
      : 'This permanently deletes your workspace and your account, including every file and folder in it. This cannot be undone.';

  return (
    <main className="settings-page" data-testid="workspace-settings-page">
      <header className="settings-header">
        <Link to="/workspace" data-testid="workspace-settings-back-link">
          ← Back to workspace
        </Link>
        <h1>Workspace settings</h1>
      </header>

      {loadError && (
        <span className="auth-error" role="alert" data-testid="workspace-settings-load-error">
          {loadError}
        </span>
      )}

      <section className="settings-section">
        <h2>General</h2>
        <form className="settings-form" data-testid="workspace-settings-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            Workspace name
            <input
              type="text"
              className="auth-input"
              data-testid="workspace-settings-display-name-input"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              disabled={submitting}
            />
          </label>
          {error && (
            <span className="auth-error" role="alert" data-testid="workspace-settings-error">
              {error}
            </span>
          )}
          {success && (
            <span className="settings-success" data-testid="workspace-settings-success">
              Workspace name updated.
            </span>
          )}
          <button
            type="submit"
            className="auth-submit-button"
            data-testid="workspace-settings-save-button"
            disabled={submitting}
          >
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </form>
      </section>

      <section className="settings-section settings-danger-zone">
        <h2>Danger zone</h2>
        <button
          type="button"
          className="settings-delete-account-button"
          data-testid="workspace-settings-delete-button"
          onClick={openDeleteModal}
        >
          Delete workspace
        </button>
      </section>

      <ConfirmModal
        open={deleteModalOpen}
        title="Delete your workspace?"
        message={deleteMessage}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
        disabled={deleteSubmitting}
        confirmDisabled={deleteSubmitting || !countsSettled}
        error={deleteError}
        testId="workspace-settings-delete-modal"
        titleTestId="workspace-settings-delete-modal-title"
        messageTestId="workspace-settings-delete-modal-message"
        confirmTestId="workspace-settings-delete-confirm-button"
        cancelTestId="workspace-settings-delete-cancel-button"
        errorTestId="workspace-settings-delete-error"
      />
    </main>
  );
}
