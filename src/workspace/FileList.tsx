import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { WorkspaceAttachment } from './types';
import FileActions from './FileActions';
import EmptyState from './EmptyState';
import { formatDate } from './formatDate';

interface FileListProps {
  files: WorkspaceAttachment[];
  // Files in the whole workspace; `files` may be a search-filtered subset.
  totalCount?: number;
  onDelete: (attachmentId: string) => void;
}

const PAGE_SIZE = 5;

type SortKey = 'name' | 'date';
type SortDirection = 'asc' | 'desc';

function sortFiles(files: WorkspaceAttachment[], sortKey: SortKey, direction: SortDirection): WorkspaceAttachment[] {
  const sorted = [...files];
  if (sortKey === 'name') {
    sorted.sort((a, b) => a.filename.localeCompare(b.filename));
  } else {
    sorted.sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
  }
  return direction === 'asc' ? sorted : sorted.reverse();
}

function SortArrow({ direction }: { direction: SortDirection }) {
  return (
    <svg
      className="file-list-sort-arrow"
      data-testid="file-list-sort-arrow"
      data-direction={direction}
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {direction === 'asc' ? <path d="M12 19V5M5 12l7-7 7 7" /> : <path d="M12 5v14M19 12l-7 7-7-7" />}
    </svg>
  );
}

function PageArrow({ direction }: { direction: 'prev' | 'next' }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={direction === 'prev' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
    </svg>
  );
}

// WF8: list view, sortable by name or last-modified. Name ascending is the
// default; clicking the active column flips its direction, clicking the other
// column switches to it (ascending). Only the active column shows an arrow.
export default function FileList({ files, totalCount = files.length, onDelete }: FileListProps) {
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [direction, setDirection] = useState<SortDirection>('asc');
  const [page, setPage] = useState(1);

  function handleSort(key: SortKey) {
    setPage(1);
    if (key === sortKey) {
      setDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setDirection('asc');
    }
  }

  if (files.length === 0) {
    return <EmptyState variant="files" testId="workspace-empty-files" />;
  }

  const sortedFiles = sortFiles(files, sortKey, direction);
  // Clamp rather than store a derived value: deleting the last row of the
  // last page, or a search narrowing the list, must not strand the user on
  // a page that no longer exists.
  const pageCount = Math.ceil(sortedFiles.length / PAGE_SIZE);
  const currentPage = Math.min(page, pageCount);
  const pageFiles = sortedFiles.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="file-list" data-testid="file-list">
      <div className="file-list-header">
        <button
          type="button"
          className={sortKey === 'name' ? 'file-list-sort-button file-list-sort-button--active file-list-header-name' : 'file-list-sort-button file-list-header-name'}
          data-testid="file-list-sort-name-button"
          onClick={() => handleSort('name')}
        >
          Name
          {sortKey === 'name' && <SortArrow direction={direction} />}
        </button>
        <button
          type="button"
          className={sortKey === 'date' ? 'file-list-sort-button file-list-sort-button--active file-list-header-date' : 'file-list-sort-button file-list-header-date'}
          data-testid="file-list-sort-date-button"
          onClick={() => handleSort('date')}
        >
          Last modified
          {sortKey === 'date' && <SortArrow direction={direction} />}
        </button>
        <span className="file-list-header-actions" aria-hidden="true" />
      </div>
      <ul className="file-list-items">
        {pageFiles.map((file) => (
          <li key={file.id} className="file-list-item" data-testid="file-list-item">
            <div className="file-list-item-name-cell">
              <Link to={`/edit/${file.id}`} className="file-list-item-name" data-testid="file-list-item-name">
                {file.filename}
              </Link>
              {file.draftUpdatedAt && (
                <span className="file-list-item-draft" data-testid="file-list-item-draft">
                  Draft
                </span>
              )}
            </div>
            <span className="file-list-item-date">{formatDate(file.updatedAt)}</span>
            <FileActions file={file} onDelete={onDelete} />
          </li>
        ))}
      </ul>
      <div className="file-list-footer" data-testid="file-list-footer">
        <span className="file-list-total" data-testid="file-list-total">
          {totalCount} {totalCount === 1 ? 'file' : 'files'} total
        </span>
        <button
          type="button"
          className="file-list-page-button"
          data-testid="file-list-prev-page"
          aria-label="Previous page"
          title="Previous page"
          disabled={currentPage <= 1}
          onClick={() => setPage(currentPage - 1)}
        >
          <PageArrow direction="prev" />
        </button>
        <span className="file-list-page-indicator" data-testid="file-list-page-indicator" aria-live="polite">
          Page {currentPage} of {pageCount}
        </span>
        <button
          type="button"
          className="file-list-page-button"
          data-testid="file-list-next-page"
          aria-label="Next page"
          title="Next page"
          disabled={currentPage >= pageCount}
          onClick={() => setPage(currentPage + 1)}
        >
          <PageArrow direction="next" />
        </button>
      </div>
    </div>
  );
}
