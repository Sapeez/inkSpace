import { useState } from 'react';
import type { WorkspaceAttachment } from './types';
import { fetchAttachment } from '../lib/index.js';

const BLOB_URL_REVOKE_DELAY_MS = 10_000;

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

// Whole MB from 10MB up, one decimal below, and KB under 0.1MB — `formatMegabytes`
// rounds to whole MB, which would read "0MB" for a typical small PDF.
function formatFileSize(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  if (megabytes >= 10) return `${Math.round(megabytes)}MB`;
  if (megabytes >= 0.1) return `${megabytes.toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

// WF9: per-file actions (download, delete), directly on the file list.
// Clicking the file name opens the annotating viewer (`/edit/:id`).
export default function FileActions({ file, onDelete }: FileActionsProps) {
  const [downloadError, setDownloadError] = useState<string | null>(null);

  async function handleDownload() {
    setDownloadError(null);
    try {
      const fetched: unknown = await fetchAttachment(file.id);
      if (!isAttachmentDownload(fetched)) throw new Error('missing download URL');
      // The signed URL is cross-origin (Supabase Storage), where browsers ignore
      // the `download` attribute and just navigate — so pull the bytes into a
      // same-origin blob URL to force a real save-to-disk.
      const response = await fetch(fetched.url);
      if (!response.ok) throw new Error(`storage responded ${response.status}`);
      const blobUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = file.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoking synchronously can cancel the save in Safari/Firefox.
      setTimeout(() => URL.revokeObjectURL(blobUrl), BLOB_URL_REVOKE_DELAY_MS);
    } catch {
      setDownloadError(`Could not download ${file.filename}. Please try again.`);
    }
  }

  return (
    <div className="file-actions">
      {downloadError && (
        <span role="alert" className="file-action-error" data-testid="file-actions-download-error">
          {downloadError}
        </span>
      )}
      <button
        type="button"
        className="file-download-button"
        data-testid="file-actions-download"
        aria-label={`Download ${file.filename}`}
        onClick={handleDownload}
      >
        <svg className="file-download-icon" viewBox="0 0 384 512" height="1em" aria-hidden="true">
          <path d="M169.4 470.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 370.8 224 64c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 306.7L54.6 265.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z" />
        </svg>
        <span className="file-download-tray" />
        <span className="file-button-tooltip file-download-tooltip" data-testid="file-actions-download-size">
          {formatFileSize(file.byteSize)}
        </span>
      </button>
      <button
        type="button"
        className="file-delete-button"
        data-testid="file-actions-delete"
        aria-label={`Delete ${file.filename}`}
        onClick={() => onDelete(file.id)}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 50 59" className="file-delete-bin" aria-hidden="true">
          <path fill="#B5BAC1" d="M0 7.5C0 5.01472 2.01472 3 4.5 3H45.5C47.9853 3 50 5.01472 50 7.5V7.5C50 8.32843 49.3284 9 48.5 9H1.5C0.671571 9 0 8.32843 0 7.5V7.5Z" />
          <path fill="#B5BAC1" d="M17 3C17 1.34315 18.3431 0 20 0H29.3125C30.9694 0 32.3125 1.34315 32.3125 3V3H17V3Z" />
          <path
            fill="#B5BAC1"
            d="M2.18565 18.0974C2.08466 15.821 3.903 13.9202 6.18172 13.9202H43.8189C46.0976 13.9202 47.916 15.821 47.815 18.0975L46.1699 55.1775C46.0751 57.3155 44.314 59.0002 42.1739 59.0002H7.8268C5.68661 59.0002 3.92559 57.3155 3.83073 55.1775L2.18565 18.0974ZM18.0003 49.5402C16.6196 49.5402 15.5003 48.4209 15.5003 47.0402V24.9602C15.5003 23.5795 16.6196 22.4602 18.0003 22.4602C19.381 22.4602 20.5003 23.5795 20.5003 24.9602V47.0402C20.5003 48.4209 19.381 49.5402 18.0003 49.5402ZM29.5003 47.0402C29.5003 48.4209 30.6196 49.5402 32.0003 49.5402C33.381 49.5402 34.5003 48.4209 34.5003 47.0402V24.9602C34.5003 23.5795 33.381 22.4602 32.0003 22.4602C30.6196 22.4602 29.5003 23.5795 29.5003 24.9602V47.0402Z"
            clipRule="evenodd"
            fillRule="evenodd"
          />
          <path fill="#B5BAC1" d="M2 13H48L47.6742 21.28H2.32031L2 13Z" />
        </svg>
        <span className="file-button-tooltip">Delete</span>
      </button>
    </div>
  );
}
