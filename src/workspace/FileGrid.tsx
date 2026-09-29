import { Link } from 'react-router-dom';
import type { WorkspaceAttachment, WorkspaceFolder } from './types';
import FileThumbnail from './FileThumbnail';
import FileActions from './FileActions';
import EmptyState from './EmptyState';
import { formatDate } from './formatDate';

interface FileGridProps {
  files: WorkspaceAttachment[];
  folders: WorkspaceFolder[];
  onMove: (attachmentId: string, folderId: string | null) => void;
  onDelete: (attachmentId: string) => void;
}

// WF6/WF9: thumbnail-card grid, the default view — filename + last-modified
// on every card, per-file actions available directly here (no need to open
// the file first).
export default function FileGrid({ files, folders, onMove, onDelete }: FileGridProps) {
  if (files.length === 0) {
    return <EmptyState variant="files" testId="workspace-empty-files" />;
  }

  return (
    <ul className="file-grid" data-testid="file-grid">
      {files.map((file) => (
        <li key={file.id} className="file-grid-item" data-testid="file-grid-item">
          <Link to={`/view/${file.id}`} className="file-grid-item-thumbnail-link">
            <FileThumbnail attachmentId={file.id} />
          </Link>
          <span className="file-grid-item-name" data-testid="file-grid-item-name">
            {file.filename}
          </span>
          <span className="file-grid-item-date" data-testid="file-grid-item-date">
            {formatDate(file.updatedAt)}
          </span>
          <FileActions file={file} folders={folders} onMove={onMove} onDelete={onDelete} />
        </li>
      ))}
    </ul>
  );
}
