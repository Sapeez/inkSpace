import { useNavigate } from 'react-router-dom';
import type { WorkspaceAttachment, WorkspaceFolder } from './types';
import { fetchAttachment } from '../lib/index.js';

interface FileActionsProps {
  file: WorkspaceAttachment;
  folders: WorkspaceFolder[];
  onMove: (attachmentId: string, folderId: string | null) => void;
  onDelete: (attachmentId: string) => void;
}

interface AttachmentDownload {
  url: string;
}

function isAttachmentDownload(value: unknown): value is AttachmentDownload {
  return typeof value === 'object' && value !== null && typeof (value as { url?: unknown }).url === 'string';
}

// WF9: per-file hover/right-click actions (open, move to folder, download,
// delete), directly on the grid/list — shared between FileGrid.tsx and
// FileList.tsx so the two views can't drift apart on what actions exist.
export default function FileActions({ file, folders, onMove, onDelete }: FileActionsProps) {
  const navigate = useNavigate();

  async function handleDownload() {
    const fetched: unknown = await fetchAttachment(file.id);
    if (!isAttachmentDownload(fetched)) return;
    const link = document.createElement('a');
    link.href = fetched.url;
    link.download = file.filename;
    link.click();
  }

  return (
    <div className="file-actions">
      <button type="button" data-testid="file-actions-open" onClick={() => navigate(`/view/${file.id}`)}>
        Open
      </button>
      <button type="button" data-testid="file-actions-download" onClick={handleDownload}>
        Download
      </button>
      <select
        className="file-actions-move-select"
        data-testid="file-actions-move-select"
        value={file.folderId ?? ''}
        onChange={(event) => onMove(file.id, event.target.value === '' ? null : event.target.value)}
        aria-label={`Move ${file.filename}`}
      >
        <option value="">Top level</option>
        {folders.map((folder) => (
          <option key={folder.id} value={folder.id}>
            {folder.name}
          </option>
        ))}
      </select>
      <button type="button" data-testid="file-actions-delete" onClick={() => onDelete(file.id)}>
        Delete
      </button>
    </div>
  );
}
