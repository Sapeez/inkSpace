import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { WorkspaceFolder } from './types';
import EmptyState from './EmptyState';

interface FolderTreeProps {
  folders: WorkspaceFolder[];
  currentFolderId: string | null;
  onCreate: (name: string, parentFolderId: string | null) => void | Promise<void>;
  onRename: (folderId: string, name: string) => void | Promise<void>;
  onDelete: (folderId: string) => void;
}

interface FolderNode extends WorkspaceFolder {
  children: FolderNode[];
}

function buildTree(folders: WorkspaceFolder[]): FolderNode[] {
  const nodes = new Map<string, FolderNode>(folders.map((folder) => [folder.id, { ...folder, children: [] }]));
  const roots: FolderNode[] = [];
  for (const folder of folders) {
    const node = nodes.get(folder.id) as FolderNode;
    if (folder.parentFolderId && nodes.has(folder.parentFolderId)) {
      (nodes.get(folder.parentFolderId) as FolderNode).children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

// WF2-WF4/WF10: sidebar folder navigation plus inline create/rename/delete —
// no modal-based folder browser (WF10's own note).
export default function FolderTree({ folders, currentFolderId, onCreate, onRename, onDelete }: FolderTreeProps) {
  const [creatingUnder, setCreatingUnder] = useState<string | null | undefined>(undefined);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>, parentFolderId: string | null) {
    event.preventDefault();
    if (newFolderName.trim().length === 0) return;
    await onCreate(newFolderName, parentFolderId);
    setNewFolderName('');
    setCreatingUnder(undefined);
  }

  async function handleRenameSubmit(event: FormEvent<HTMLFormElement>, folderId: string) {
    event.preventDefault();
    if (renameValue.trim().length === 0) return;
    await onRename(folderId, renameValue);
    setRenamingId(null);
  }

  function renderNode(node: FolderNode) {
    return (
      <li key={node.id} className="folder-tree-node">
        {renamingId === node.id ? (
          <form onSubmit={(event) => handleRenameSubmit(event, node.id)} className="folder-tree-inline-form">
            <input
              className="folder-tree-input"
              data-testid="folder-rename-input"
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              autoFocus
            />
            <button type="submit">Save</button>
            <button type="button" onClick={() => setRenamingId(null)}>
              Cancel
            </button>
          </form>
        ) : (
          <div className="folder-tree-row" data-testid="folder-tree-item">
            <Link
              to={`/workspace/folders/${node.id}`}
              className={currentFolderId === node.id ? 'folder-tree-link folder-tree-link--active' : 'folder-tree-link'}
            >
              {node.name}
            </Link>
            <span className="folder-tree-actions">
              <button
                type="button"
                data-testid="folder-create-button"
                aria-label={`New folder inside ${node.name}`}
                onClick={() => {
                  setCreatingUnder(node.id);
                  setNewFolderName('');
                }}
              >
                +
              </button>
              <button
                type="button"
                data-testid="folder-rename-button"
                aria-label={`Rename ${node.name}`}
                onClick={() => {
                  setRenamingId(node.id);
                  setRenameValue(node.name);
                }}
              >
                ✎
              </button>
              <button
                type="button"
                data-testid="folder-delete-button"
                aria-label={`Delete ${node.name}`}
                onClick={() => onDelete(node.id)}
              >
                ×
              </button>
            </span>
          </div>
        )}
        {creatingUnder === node.id && (
          <form onSubmit={(event) => handleCreateSubmit(event, node.id)} className="folder-tree-inline-form">
            <input
              className="folder-tree-input"
              data-testid="folder-create-input"
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
              placeholder="Folder name"
              autoFocus
            />
            <button type="submit" data-testid="folder-create-confirm-button">
              Create
            </button>
            <button type="button" onClick={() => setCreatingUnder(undefined)}>
              Cancel
            </button>
          </form>
        )}
        {node.children.length > 0 && <ul className="folder-tree-children">{node.children.map(renderNode)}</ul>}
      </li>
    );
  }

  const tree = buildTree(folders);

  return (
    <nav className="folder-tree" data-testid="folder-tree" aria-label="Folders">
      <div className="folder-tree-header">
        <span>Folders</span>
        <button
          type="button"
          data-testid="folder-create-button"
          aria-label="New top-level folder"
          onClick={() => {
            setCreatingUnder(null);
            setNewFolderName('');
          }}
        >
          + New folder
        </button>
      </div>
      {creatingUnder === null && (
        <form onSubmit={(event) => handleCreateSubmit(event, null)} className="folder-tree-inline-form">
          <input
            className="folder-tree-input"
            data-testid="folder-create-input"
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            placeholder="Folder name"
            autoFocus
          />
          <button type="submit" data-testid="folder-create-confirm-button">
            Create
          </button>
          <button type="button" onClick={() => setCreatingUnder(undefined)}>
            Cancel
          </button>
        </form>
      )}
      {tree.length === 0 ? (
        <EmptyState variant="folders" testId="workspace-empty-folders" />
      ) : (
        <ul className="folder-tree-list">{tree.map(renderNode)}</ul>
      )}
    </nav>
  );
}
