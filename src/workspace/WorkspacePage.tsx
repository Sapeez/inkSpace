import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../lib/supabaseClient';
import { useSession } from '../lib/session';
import {
  fetchFolders,
  fetchAttachments,
  createAttachment,
  createFolder,
  changeFolder,
  moveAttachmentToFolder,
  removeAttachment,
  removeFolder,
} from '../lib/index.js';
import { validateFilename } from '../utils/filenameUtils.js';
import { MAX_UPLOAD_BYTES, formatMegabytes } from '../utils/uploadLimits.js';
import type { WorkspaceAttachment, WorkspaceFolder } from './types';
import RecentSection from './RecentSection';
import FileGrid from './FileGrid';
import FileList from './FileList';
import Breadcrumbs from './Breadcrumbs';
import FolderTree from './FolderTree';
import SearchBar from './SearchBar';
import ConfirmModal from '../modals/ConfirmModal.jsx';

type ViewMode = 'grid' | 'list';

type PendingDelete = { kind: 'file'; id: string; name: string } | { kind: 'folder'; id: string; name: string };

interface WorkspacePageProps {
  // Testability seam only — see the matching comment on LoginPage.tsx/
  // SignupPage.tsx.
  auth?: Pick<SupabaseClient['auth'], 'signOut'>;
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

interface CreatedAttachment {
  id: string;
}

function isCreatedAttachment(value: unknown): value is CreatedAttachment {
  return typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'string';
}

// WF1-WF11: the workspace file-manager shell — Recent (root only, WF7),
// folder sidebar + breadcrumbs (WF2-WF4/WF10), search (WF11), grid/list
// toggle (WF6/WF8), and Upload as the primary call to action (design req
// 3.3) rather than a template/create-new flow (out-of-scope 3.4).
export default function WorkspacePage({ auth = getSupabaseClient().auth }: WorkspacePageProps = {}) {
  const navigate = useNavigate();
  const { session } = useSession();
  const params = useParams<{ folderId?: string }>();
  const currentFolderId = params.folderId ?? null;

  const [folders, setFolders] = useState<WorkspaceFolder[]>([]);
  const [files, setFiles] = useState<WorkspaceAttachment[]>([]);
  const [allFiles, setAllFiles] = useState<WorkspaceAttachment[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // §4.4: any destructive action reachable from the UI (WF9 file delete,
  // WF4 folder delete) is gated by a confirmation modal — `FileActions`/
  // `FolderTree` only ever request a delete here, never call the API
  // directly.
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadFolders = useCallback(async () => {
    const fetched = (await fetchFolders()) as WorkspaceFolder[];
    setFolders(fetched);
  }, []);

  const loadFiles = useCallback(async () => {
    const fetched = (await fetchAttachments({ folderId: currentFolderId ?? 'root' })) as WorkspaceAttachment[];
    setFiles(fetched);
  }, [currentFolderId]);

  // WF7/WF11: unlike `files` (scoped to whichever folder is currently open),
  // this is every attachment in the caller's workspace regardless of folder
  // — `fetchAttachments({})` applies no `folderId` filter server-side (see
  // storage.ts's `listAttachments`). Recent (root-only display, but the
  // files it lists shouldn't be limited to unfiled ones) and the search bar
  // (must search the whole workspace, not just the folder you're browsing —
  // found in code review, previously `allFiles` was actually just the
  // root-level list under a misleading name) both need the true full list.
  const loadAllFiles = useCallback(async () => {
    const fetched = (await fetchAttachments({})) as WorkspaceAttachment[];
    setAllFiles(fetched);
  }, []);

  const refreshFiles = useCallback(async () => {
    await Promise.all([loadFiles(), loadAllFiles()]);
  }, [loadFiles, loadAllFiles]);

  useEffect(() => {
    setLoadError(null);
    Promise.all([loadFolders(), refreshFiles()]).catch((err) => {
      setLoadError(err instanceof Error ? err.message : 'Could not load your workspace.');
    });
  }, [loadFolders, refreshFiles]);

  async function handleLogout() {
    await auth.signOut();
    navigate('/login');
  }

  async function handleUploadChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const filenameError = validateFilename(file.name);
    if (filenameError) {
      setUploadError(filenameError);
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(`File exceeds the ${formatMegabytes(MAX_UPLOAD_BYTES)} limit`);
      return;
    }

    setUploadError(null);
    setUploading(true);
    try {
      const pdfBase64 = await readFileAsBase64(file);
      const created: unknown = await createAttachment({ filename: file.name, pdfBase64 });
      if (currentFolderId && isCreatedAttachment(created)) {
        await moveAttachmentToFolder(created.id, currentFolderId);
      }
      await refreshFiles();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  async function handleFolderCreate(name: string, parentFolderId: string | null) {
    await createFolder({ name, parentFolderId });
    await loadFolders();
  }

  async function handleFolderRename(folderId: string, name: string) {
    await changeFolder(folderId, { name });
    await loadFolders();
  }

  function requestFolderDelete(folderId: string) {
    const folder = folders.find((f) => f.id === folderId);
    setDeleteError(null);
    setPendingDelete({ kind: 'folder', id: folderId, name: folder?.name ?? 'this folder' });
  }

  async function handleFileMove(attachmentId: string, folderId: string | null) {
    await moveAttachmentToFolder(attachmentId, folderId);
    await refreshFiles();
  }

  function requestFileDelete(attachmentId: string) {
    const file = files.find((f) => f.id === attachmentId) ?? allFiles.find((f) => f.id === attachmentId);
    setDeleteError(null);
    setPendingDelete({ kind: 'file', id: attachmentId, name: file?.filename ?? 'this file' });
  }

  async function handleConfirmDelete() {
    if (!pendingDelete || deleteSubmitting) return;
    setDeleteSubmitting(true);
    try {
      if (pendingDelete.kind === 'file') {
        await removeAttachment(pendingDelete.id);
        await refreshFiles();
      } else {
        await removeFolder(pendingDelete.id);
        await loadFolders();
        if (pendingDelete.id === currentFolderId) {
          navigate('/workspace');
        } else {
          await refreshFiles();
        }
      }
      setPendingDelete(null);
    } catch (err) {
      // §4.8's "stay open, don't auto-close on failure" applies here too —
      // same reasoning as SettingsPage.tsx's delete-account modal.
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

  // WF11: search is workspace-wide, not scoped to whichever folder happens
  // to be open — found in code review: this previously filtered `files`
  // (the current folder's own list), so searching from inside a folder
  // could never surface a match that lived elsewhere in the workspace.
  const visibleFiles =
    searchQuery.trim().length === 0
      ? files
      : allFiles.filter((file) => file.filename.toLowerCase().includes(searchQuery.trim().toLowerCase()));

  return (
    <main className="workspace-page" data-testid="workspace-page">
      <header className="workspace-header">
        <span data-testid="workspace-user-email">{session?.user.email}</span>
        <Link to="/settings" data-testid="settings-link">
          Settings
        </Link>
        <Link to="/workspace/settings" data-testid="workspace-settings-link">
          Workspace settings
        </Link>
        <button type="button" className="auth-submit-button" data-testid="logout-button" onClick={handleLogout}>
          Log out
        </button>
      </header>

      <div className="workspace-body">
        <aside className="workspace-sidebar">
          <FolderTree
            folders={folders}
            currentFolderId={currentFolderId}
            onCreate={handleFolderCreate}
            onRename={handleFolderRename}
            onDelete={requestFolderDelete}
          />
        </aside>

        <div className="workspace-main">
          <div className="workspace-toolbar">
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
              className="workspace-upload-input"
              data-testid="workspace-upload-input"
              onChange={handleUploadChange}
              style={{ display: 'none' }}
            />
            <SearchBar value={searchQuery} onChange={setSearchQuery} />
            <div className="workspace-view-toggle">
              <button
                type="button"
                data-testid="workspace-view-grid-button"
                className={viewMode === 'grid' ? 'workspace-view-toggle-button workspace-view-toggle-button--active' : 'workspace-view-toggle-button'}
                onClick={() => setViewMode('grid')}
                aria-label="Grid view"
              >
                Grid
              </button>
              <button
                type="button"
                data-testid="workspace-view-list-button"
                className={viewMode === 'list' ? 'workspace-view-toggle-button workspace-view-toggle-button--active' : 'workspace-view-toggle-button'}
                onClick={() => setViewMode('list')}
                aria-label="List view"
              >
                List
              </button>
            </div>
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

          <Breadcrumbs folders={folders} currentFolderId={currentFolderId} />

          {!currentFolderId && <RecentSection files={allFiles} />}

          {viewMode === 'grid' ? (
            <FileGrid files={visibleFiles} folders={folders} onMove={handleFileMove} onDelete={requestFileDelete} />
          ) : (
            <FileList files={visibleFiles} folders={folders} onMove={handleFileMove} onDelete={requestFileDelete} />
          )}
        </div>
      </div>

      <ConfirmModal
        open={pendingDelete !== null}
        title={pendingDelete?.kind === 'folder' ? 'Delete folder?' : 'Delete file?'}
        message={
          pendingDelete?.kind === 'folder'
            ? `This permanently deletes "${pendingDelete.name}" and any subfolders inside it. Files inside move to the top level, not deleted. This cannot be undone.`
            : `This permanently deletes "${pendingDelete?.name}". This cannot be undone.`
        }
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
