import { useNavigate } from 'react-router-dom';
import type { WorkspaceAttachment } from './types';
import { fetchAttachment } from '../lib/index.js';

interface FileActionsProps {
  file: WorkspaceAttachment;
  onDelete: (attachmentId: string) => void;
}

interface AttachmentDownload {
  url: string;
}

function isAttachmentDownload(value: unknown): value is AttachmentDownload {
  return typeof value === 'object' && value !== null && typeof (value as { url?: unknown }).url === 'string';
}

// WF9: per-file hover/right-click actions (open, download, delete), directly on the file list.
export default function FileActions({ file, onDelete }: FileActionsProps) {
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
      <button type="button" data-testid="file-actions-delete" onClick={() => onDelete(file.id)}>
        Delete
      </button>
    </div>
  );
}
