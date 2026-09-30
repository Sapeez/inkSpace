import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabaseClient';
import {
  fetchAttachments,
  createAttachment,
  removeAttachment,
} from '../lib/index.js';
import { validateFilename } from '../utils/filenameUtils.js';
import { MAX_UPLOAD_BYTES, formatMegabytes } from '../utils/uploadLimits.js';
import type { WorkspaceAttachment } from './types';
import RecentSection from './RecentSection';
import FileList from './FileList';
import SearchBar from './SearchBar';
import SettingsModal from '../modals/SettingsModal';
import ConfirmModal from '../modals/ConfirmModal.jsx';


const MAX_FILES_PER_UPLOAD = 5;

interface PendingDelete {
  id: string;
  name: string;
}

interface WorkspacePageProps {
  // Testability seam only — see the matching comment on LoginPage.tsx/
  // SignupPage.tsx.
  auth?: Pick<SupabaseClient['auth'], 'signOut' | 'updateUser'>;
}

const MAX_CONFIRM_NAME_LENGTH = 20;

// Keeps a long filename inside the delete-confirm card's borders.
function truncateName(name: string): string {
  return name.length > MAX_CONFIRM_NAME_LENGTH ? `${name.slice(0, MAX_CONFIRM_NAME_LENGTH)}…` : name;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => {
      const result = reader.result as string;
      // `data:application/pdf;base64,<data>` — only the part after the comma
      // is the base64 payload `POST /api/attachments` expects.
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

// WF6-WF9/WF11: the workspace file-manager shell — Recent (WF7), search
// (WF11), and Upload as the primary call to
// action (design req 3.3) rather than a template/create-new flow
// (out-of-scope 3.4). The folder sidebar/breadcrumbs (WF1-WF4/WF10) were
// removed — the workspace is one flat list of files.
export default function WorkspacePage({ auth = getSupabaseClient().auth }: WorkspacePageProps = {}) {
  const navigate = useNavigate();

  const [files, setFiles] = useState<WorkspaceAttachment[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  // True until the first fetch settles, so the empty state isn't shown for a list that simply hasn't arrived yet.
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  // §4.4: WF9 file delete is gated by a confirmation modal — `FileActions`
  // only ever requests a delete here, never calls the API directly.
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadFiles = useCallback(async () => {
    const fetched = (await fetchAttachments({})) as WorkspaceAttachment[];
    setFiles(fetched);
  }, []);

  useEffect(() => {
    setLoadError(null);
    loadFiles()
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : 'Could not load your workspace.');
      })
      .finally(() => setLoading(false));
  }, [loadFiles]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) setAccountMenuOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setAccountMenuOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [accountMenuOpen]);

  async function handleLogout() {
    await auth.signOut();
    navigate('/login');
  }

  async function handleUploadChange(event: ChangeEvent<HTMLInputElement>) {
    // A native file picker can't cap how many files it lets the user tick, so
    // keep the first MAX_FILES_PER_UPLOAD of whatever was chosen.
    const selected = Array.from(event.target.files ?? []).slice(0, MAX_FILES_PER_UPLOAD);
    event.target.value = '';
    if (selected.length === 0) return;

    setUploadError(null);
    setUploading(true);
    const failures: string[] = [];
    try {
      for (const file of selected) {
        const filenameError = validateFilename(file.name);
        if (filenameError) {
          failures.push(`${file.name}: ${filenameError}`);
          continue;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
          failures.push(`${file.name}: file exceeds the ${formatMegabytes(MAX_UPLOAD_BYTES)} limit`);
          continue;
        }
        try {
          const pdfBase64 = await readFileAsBase64(file);
          await createAttachment({ filename: file.name, pdfBase64 });
        } catch (err) {
          failures.push(`${file.name}: ${err instanceof Error ? err.message : 'Upload failed. Please try again.'}`);
        }
      }
      // Refresh even after partial failure so the files that did upload show up.
      if (failures.length < selected.length) await loadFiles();
    } catch (err) {
      failures.push(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setUploadError(failures.length > 0 ? failures.join('\n') : null);
      setUploading(false);
    }
  }

  function requestFileDelete(attachmentId: string) {
    const file = files.find((f) => f.id === attachmentId);
    setDeleteError(null);
    setPendingDelete({ id: attachmentId, name: file?.filename ?? 'this file' });
  }

  async function handleConfirmDelete() {
    if (!pendingDelete || deleteSubmitting) return;
    setDeleteSubmitting(true);
    try {
      await removeAttachment(pendingDelete.id);
      await loadFiles();
      setPendingDelete(null);
    } catch (err) {
      // §4.8's "stay open, don't auto-close on failure" — same reasoning as
      // SettingsPage.tsx's delete-account modal.
      setDeleteError(err instanceof Error ? err.message : 'Could not delete. Please try again.');
    } finally {
      setDeleteSubmitting(false);
    }
  }

  function handleCancelDelete() {
    if (deleteSubmitting) return;
    setPendingDelete(null);
    setDeleteError(null);
  }

  const visibleFiles =
    searchQuery.trim().length === 0
      ? files
      : files.filter((file) => file.filename.toLowerCase().includes(searchQuery.trim().toLowerCase()));

  return (
    <main className="workspace-page" data-testid="workspace-page">
      <div className="workspace-body">
        <div className="workspace-main">
          <div className="workspace-account-bar">
            <div className="account-menu" ref={accountMenuRef}>
              <button
                type="button"
                className="account-menu-trigger"
                data-testid="account-menu-button"
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
                onClick={() => setAccountMenuOpen((open) => !open)}
              >
                Account
                <svg className="account-menu-caret" viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {accountMenuOpen && (
                <div className="account-menu-list" role="menu" data-testid="account-menu">
                  <button
                    type="button"
                    role="menuitem"
                    className="account-menu-item"
                    data-testid="settings-link"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      setSettingsOpen(true);
                    }}
                  >
                    <svg viewBox="0 0 32 32" aria-hidden="true">
                      <path d="m17.074 30h-2.148c-1.038 0-1.914-.811-1.994-1.846l-.125-1.635c-.687-.208-1.351-.484-1.985-.824l-1.246 1.067c-.788.677-1.98.631-2.715-.104l-1.52-1.52c-.734-.734-.78-1.927-.104-2.715l1.067-1.246c-.34-.635-.616-1.299-.824-1.985l-1.634-.125c-1.035-.079-1.846-.955-1.846-1.993v-2.148c0-1.038.811-1.914 1.846-1.994l1.635-.125c.208-.687.484-1.351.824-1.985l-1.068-1.247c-.676-.788-.631-1.98.104-2.715l1.52-1.52c.734-.734 1.927-.779 2.715-.104l1.246 1.067c.635-.34 1.299-.616 1.985-.824l.125-1.634c.08-1.034.956-1.845 1.994-1.845h2.148c1.038 0 1.914.811 1.994 1.846l.125 1.635c.687.208 1.351.484 1.985.824l1.246-1.067c.787-.676 1.98-.631 2.715.104l1.52 1.52c.734.734.78 1.927.104 2.715l-1.067 1.246c.34.635.616 1.299.824 1.985l1.634.125c1.035.079 1.846.955 1.846 1.993v2.148c0 1.038-.811 1.914-1.846 1.994l-1.635.125c-.208.687-.484 1.351-.824 1.985l1.067 1.246c.677.788.631 1.98-.104 2.715l-1.52 1.52c-.734.734-1.928.78-2.715.104l-1.246-1.067c-.635.34-1.299.616-1.985.824l-.125 1.634c-.079 1.035-.955 1.846-1.993 1.846zm-5.835-6.373c.848.53 1.768.912 2.734 1.135.426.099.739.462.772.898l.18 2.341 2.149-.001.18-2.34c.033-.437.347-.8.772-.898.967-.223 1.887-.604 2.734-1.135.371-.232.849-.197 1.181.089l1.784 1.529 1.52-1.52-1.529-1.784c-.285-.332-.321-.811-.089-1.181.53-.848.912-1.768 1.135-2.734.099-.426.462-.739.898-.772l2.341-.18h-.001v-2.148l-2.34-.18c-.437-.033-.8-.347-.898-.772-.223-.967-.604-1.887-1.135-2.734-.232-.37-.196-.849.089-1.181l1.529-1.784-1.52-1.52-1.784 1.529c-.332.286-.81.321-1.181.089-.848-.53-1.768-.912-2.734-1.135-.426-.099-.739-.462-.772-.898l-.18-2.341-2.148.001-.18 2.34c-.033.437-.347.8-.772.898-.967.223-1.887.604-2.734 1.135-.37.232-.849.197-1.181-.089l-1.785-1.529-1.52 1.52 1.529 1.784c.285.332.321.811.089 1.181-.53.848-.912 1.768-1.135 2.734-.099.426-.462.739-.898.772l-2.341.18.002 2.148 2.34.18c.437.033.8.347.898.772.223.967.604 1.887 1.135 2.734.232.37.196.849-.089 1.181l-1.529 1.784 1.52 1.52 1.784-1.529c.332-.287.813-.32 1.18-.089z" fill="currentColor" />
                      <path d="m16 23c-3.859 0-7-3.141-7-7s3.141-7 7-7 7 3.141 7 7-3.141 7-7 7zm0-12c-2.757 0-5 2.243-5 5s2.243 5 5 5 5-2.243 5-5-2.243-5-5-5z" fill="currentColor" />
                    </svg>
                    Settings
                  </button>
                  <button type="button" role="menuitem" className="account-menu-item" data-testid="logout-button" onClick={handleLogout}>
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M6 2H3.5A1.5 1.5 0 0 0 2 3.5v9A1.5 1.5 0 0 0 3.5 14H6M10.5 11l3-3-3-3M13.5 8H6" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="workspace-toolbar">
            {!loading && files.length > 0 && <h2 className="workspace-toolbar-title">Recent</h2>}
            <button
              type="button"
              className="workspace-upload-button"
              data-testid="workspace-upload-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              multiple
              className="workspace-upload-input"
              data-testid="workspace-upload-input"
              onChange={handleUploadChange}
              style={{ display: 'none' }}
            />
            <SearchBar value={searchQuery} onChange={setSearchQuery} />
          </div>

          {uploadError && (
            <span className="workspace-upload-error" role="alert" data-testid="workspace-upload-error">
              {uploadError}
            </span>
          )}
          {loadError && (
            <span className="workspace-upload-error" role="alert">
              {loadError}
            </span>
          )}

          {loading ? (
            <div className="dots-container" role="status" aria-label="Loading files" data-testid="workspace-loading">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          ) : (
            <>
              <RecentSection files={files} />

              <FileList files={visibleFiles} totalCount={files.length} onDelete={requestFileDelete} />
            </>
          )}
        </div>
      </div>

      <SettingsModal auth={auth} open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <ConfirmModal
        open={pendingDelete !== null}
        title="Delete file?"
        message={`Are you sure you want to delete "${truncateName(pendingDelete?.name ?? '')}"?`}
        variant="card"
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        disabled={deleteSubmitting}
        error={deleteError}
        testId="workspace-delete-confirm-modal"
        titleTestId="workspace-delete-confirm-title"
        messageTestId="workspace-delete-confirm-message"
        confirmTestId="workspace-delete-confirm-button"
        cancelTestId="workspace-delete-cancel-button"
        errorTestId="workspace-delete-error"
      />
    </main>
  );
}
