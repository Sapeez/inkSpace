import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { setupJsdom } from './setup/jsdom';
import { TEST_IDS } from './consts/inkSpace';
import type { WorkspaceFolder } from '../src/workspace/types';

setupJsdom();

const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { MemoryRouter } = await import('react-router-dom');
const { default: FolderTree } = await import('../src/workspace/FolderTree');

afterEach(() => {
  cleanup();
});

interface RenderTreeProps {
  folders?: WorkspaceFolder[];
  currentFolderId?: string | null;
  onCreate?: (name: string, parentFolderId: string | null) => Promise<void>;
  onRename?: (folderId: string, name: string) => Promise<void>;
  onDelete?: (folderId: string) => void;
}

function renderTree(props: RenderTreeProps = {}) {
  const onCreate = mock.fn(async () => {});
  const onRename = mock.fn(async () => {});
  const onDelete = mock.fn(async () => {});
  render(
    <MemoryRouter>
      <FolderTree
        folders={props.folders ?? []}
        currentFolderId={props.currentFolderId ?? null}
        onCreate={props.onCreate ?? onCreate}
        onRename={props.onRename ?? onRename}
        onDelete={props.onDelete ?? onDelete}
      />
    </MemoryRouter>,
  );
  return { onCreate, onRename, onDelete };
}

test('WF2: with no folders, the empty-folders state renders', () => {
  renderTree();
  assert.ok(screen.getByTestId(TEST_IDS.WORKSPACE_EMPTY_FOLDERS));
});

test('WF2: creating a top-level folder calls onCreate with a null parent', async () => {
  const { onCreate } = renderTree();

  fireEvent.click(screen.getAllByTestId(TEST_IDS.FOLDER_CREATE_BUTTON)[0] as HTMLElement);
  fireEvent.change(screen.getByTestId(TEST_IDS.FOLDER_CREATE_INPUT), { target: { value: 'Contracts' } });
  fireEvent.click(screen.getByTestId(TEST_IDS.FOLDER_CREATE_CONFIRM_BUTTON));

  await waitFor(() => {
    assert.equal(screen.queryByTestId(TEST_IDS.FOLDER_CREATE_INPUT), null);
  });
  assert.equal(onCreate.mock.callCount(), 1);
  assert.deepEqual(onCreate.mock.calls[0]?.arguments, ['Contracts', null]);
});

test('WF2: renaming a folder calls onRename with its id and the new name', async () => {
  const { onRename } = renderTree({
    folders: [{ id: 'f1', name: 'Old name', parentFolderId: null, createdAt: '', updatedAt: '' }],
  });

  fireEvent.click(screen.getByTestId(TEST_IDS.FOLDER_RENAME_BUTTON));
  fireEvent.change(screen.getByTestId(TEST_IDS.FOLDER_RENAME_INPUT), { target: { value: 'New name' } });
  fireEvent.submit(screen.getByTestId(TEST_IDS.FOLDER_RENAME_INPUT).closest('form') as HTMLFormElement);

  await waitFor(() => {
    assert.equal(screen.queryByTestId(TEST_IDS.FOLDER_RENAME_INPUT), null);
  });
  assert.deepEqual(onRename.mock.calls[0]?.arguments, ['f1', 'New name']);
});

test('WF4: deleting a folder calls onDelete with its id', () => {
  const { onDelete } = renderTree({
    folders: [{ id: 'f1', name: 'Contracts', parentFolderId: null, createdAt: '', updatedAt: '' }],
  });

  fireEvent.click(screen.getByTestId(TEST_IDS.FOLDER_DELETE_BUTTON));

  assert.deepEqual(onDelete.mock.calls[0]?.arguments, ['f1']);
});

test('WF10: nested folders render as children of their parent', () => {
  renderTree({
    folders: [
      { id: 'f1', name: 'Contracts', parentFolderId: null, createdAt: '', updatedAt: '' },
      { id: 'f2', name: '2026', parentFolderId: 'f1', createdAt: '', updatedAt: '' },
    ],
  });

  assert.equal(screen.getAllByTestId(TEST_IDS.FOLDER_TREE_ITEM).length, 2);
  assert.ok(screen.getByText('2026'));
});
