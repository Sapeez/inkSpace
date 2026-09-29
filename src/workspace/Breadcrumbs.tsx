import { Link } from 'react-router-dom';
import type { WorkspaceFolder } from './types';

interface BreadcrumbsProps {
  folders: WorkspaceFolder[];
  currentFolderId: string | null;
}

// WF10: breadcrumb navigation — built from the flat `folders` list's
// `parentFolderId` chain, not a separate server call. The workspace root is
// always the first crumb.
function buildChain(folders: WorkspaceFolder[], currentFolderId: string | null): WorkspaceFolder[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const chain: WorkspaceFolder[] = [];
  let cursor = currentFolderId ? byId.get(currentFolderId) : undefined;
  while (cursor) {
    chain.unshift(cursor);
    cursor = cursor.parentFolderId ? byId.get(cursor.parentFolderId) : undefined;
  }
  return chain;
}

export default function Breadcrumbs({ folders, currentFolderId }: BreadcrumbsProps) {
  const chain = buildChain(folders, currentFolderId);

  return (
    <nav className="breadcrumbs" data-testid="breadcrumbs" aria-label="Breadcrumb">
      <Link to="/workspace" className="breadcrumb-item" data-testid="breadcrumb-item">
        Workspace
      </Link>
      {chain.map((folder) => (
        <span key={folder.id}>
          {' / '}
          <Link to={`/workspace/folders/${folder.id}`} className="breadcrumb-item" data-testid="breadcrumb-item">
            {folder.name}
          </Link>
        </span>
      ))}
    </nav>
  );
}
