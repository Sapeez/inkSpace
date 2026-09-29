import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { WorkspaceAttachment, WorkspaceFolder } from './types';
import FileActions from './FileActions';
import EmptyState from './EmptyState';
import { formatDate } from './formatDate';

interface FileListProps {
  files: WorkspaceAttachment[];
  folders: WorkspaceFolder[];
  onMove: (attachmentId: string, folderId: string | null) => void;
  onDelete: (attachmentId: string) => void;
}

type SortKey = 'name' | 'date';

function sortFiles(files: WorkspaceAttachment[], sortKey: SortKey): WorkspaceAttachment[] {
  const sorted = [...files];
  if (sortKey === 'name') {
    sorted.sort((a, b) => a.filename.localeCompare(b.filename));
  } else {
    sorted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
  return sorted;
}

// WF8: list view, sortable by name or last-modified.
export default function FileList({ files, folders, onMove, onDelete }: FileListProps) {
  const [sortKey, setSortKey] = useState<SortKey>('name');

  if (files.length === 0) {
    return <EmptyState variant="files" testId="workspace-empty-files" />;
  }

  const sortedFiles = sortFiles(files, sortKey);

  return (
    <div className="file-list" data-testid="file-list">
      <div className="file-list-header">
        <button
          type="button"
          className={sortKey === 'name' ? 'file-list-sort-button file-list-sort-button--active' : 'file-list-sort-button'}
          data-testid="file-list-sort-name-button"
          onClick={() => setSortKey('name')}
        >
          Name
        </button>
        <button
          type="button"
          className={sortKey === 'date' ? 'file-list-sort-button file-list-sort-button--active' : 'file-list-sort-button'}
          data-testid="file-list-sort-date-button"
          onClick={() => setSortKey('date')}
        >
          Last modified
        </button>
      </div>
      <ul className="file-list-items">
        {sortedFiles.map((file) => (
          <li key={file.id} className="file-list-item" data-testid="file-list-item">
            <Link to={`/view/${file.id}`} className="file-list-item-name">
              {file.filename}
            </Link>
            <span className="file-list-item-date">{formatDate(file.updatedAt)}</span>
            <FileActions file={file} folders={folders} onMove={onMove} onDelete={onDelete} />
          </li>
        ))}
      </ul>
    </div>
  );
}
