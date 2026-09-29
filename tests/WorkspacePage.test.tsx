import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { setupJsdom } from './setup/jsdom';
import { TEST_IDS, folderDeleteButtonTestId } from './consts/inkSpace';

setupJsdom();

const { cleanup, fireEvent, render, screen, waitFor, within } = await import('@testing-library/react');
const { MemoryRouter, Routes, Route } = await import('react-router-dom');
const { default: WorkspacePage } = await import('../src/workspace/WorkspacePage');

const originalFetch = globalThis.fetch;
const NOW = '2026-01-01T00:00:00.000Z';

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

interface FakeFolder {
  id: string;
  name: string;
  parentFolderId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FakeAttachment {
  id: string;
  filename: string;
  mimeType: string;
  pageCount: number | null;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
}

function installFakeApi(initial: { folders?: FakeFolder[]; attachments?: FakeAttachment[] } = {}) {
  let folders = initial.folders ?? [];
  let attachments = initial.attachments ?? [];
  let nextId = 1;

  globalThis.fetch = (async (input: unknown, init: RequestInit = {}) => {
    const url = String(input);
    const method = (init.method ?? 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body as string) : undefined;

    if (/^\/api\/folders\/move-file\//.test(url)) {
      const id = url.split('/').pop() as string;
      attachments = attachments.map((a) => (a.id === id ? { ...a, folderId: body.folderId } : a));
      return jsonResponse(null, 204);
    }
    if (/^\/api\/folders\/[^/]+$/.test(url) && method === 'PATCH') {
      const id = url.split('/').pop() as string;
      folders = folders.map((f) => (f.id === id ? { ...f, name: body.name } : f));
      return jsonResponse(folders.find((f) => f.id === id));
    }
    if (/^\/api\/folders\/[^/]+$/.test(url) && method === 'DELETE') {
      const id = url.split('/').pop() as string;
      folders = folders.filter((f) => f.id !== id);
      attachments = attachments.map((a) => (a.folderId === id ? { ...a, folderId: null } : a));
      return jsonResponse(null, 204);
    }
    if (url === '/api/folders' && method === 'POST') {
      const newFolder: FakeFolder = {
        id: `folder-${nextId++}`,
        name: body.name,
        parentFolderId: body.parentFolderId ?? null,
        createdAt: NOW,
        updatedAt: NOW,
      };
      folders.push(newFolder);
      return jsonResponse(newFolder, 201);
    }
    if (url === '/api/folders' && method === 'GET') {
      return jsonResponse(folders);
    }
    if (/^\/api\/attachments\/[^/?]+$/.test(url) && method === 'GET') {
      const id = url.split('/').pop() as string;
      const attachment = attachments.find((a) => a.id === id);
      return jsonResponse({ ...attachment, url: 'blob:fake-url' });
    }
    if (/^\/api\/attachments\/[^/?]+$/.test(url) && method === 'DELETE') {
      const id = url.split('/').pop() as string;
      attachments = attachments.filter((a) => a.id !== id);
      return jsonResponse(null, 204);
    }
    if (url.startsWith('/api/attachments') && method === 'GET') {
      const queryIndex = url.indexOf('?');
      const query = new URLSearchParams(queryIndex >= 0 ? url.slice(queryIndex + 1) : '');
      const folderId = query.get('folderId');
      let list = attachments;
      if (folderId === 'root') list = attachments.filter((a) => a.folderId === null);
      else if (folderId) list = attachments.filter((a) => a.folderId === folderId);
      return jsonResponse(list);
    }
    if (url === '/api/attachments' && method === 'POST') {
      const newAttachment: FakeAttachment = {
        id: `attachment-${nextId++}`,
        filename: body.filename,
        mimeType: 'application/pdf',
        pageCount: 1,
        folderId: null,
        createdAt: NOW,
        updatedAt: NOW,
      };
      attachments.push(newAttachment);
      return jsonResponse(newAttachment, 201);
    }

    throw new Error(`Unhandled fake fetch: ${method} ${url}`);
  }) as typeof fetch;

  return {
    get folders() {
      return folders;
    },
    get attachments() {
      return attachments;
    },
  };
}

function renderWorkspacePage(initialEntry = '/workspace', signOut = mock.fn(async () => ({ error: null }))) {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/workspace" element={<WorkspacePage auth={{ signOut } as never} />} />
        <Route path="/workspace/folders/:folderId" element={<WorkspacePage auth={{ signOut } as never} />} />
        <Route path="/login" element={<div data-testid="login-landed" />} />
        <Route path="/view/:attachmentId" element={<div data-testid="viewer-landed" />} />
      </Routes>
    </MemoryRouter>,
  );
  return { signOut };
}

test('LG4: clicking logout calls signOut and returns to the login page', async () => {
  installFakeApi();
  const { signOut } = renderWorkspacePage();

  fireEvent.click(screen.getByTestId(TEST_IDS.LOGOUT_BUTTON));

  await waitFor(() => {
    assert.ok(screen.getByTestId('login-landed'));
  });
  assert.equal(signOut.mock.callCount(), 1);
});

test('WF6: fetched attachments render as thumbnail cards with filename and date, default view is grid', async () => {
  installFakeApi({
    attachments: [{ id: 'a1', filename: 'report.pdf', mimeType: 'application/pdf', pageCount: 1, folderId: null, createdAt: NOW, updatedAt: NOW }],
  });
  renderWorkspacePage();

  await waitFor(() => {
    assert.ok(screen.getByTestId(TEST_IDS.FILE_GRID));
  });
  assert.equal(screen.getByTestId(TEST_IDS.FILE_GRID_ITEM_NAME).textContent, 'report.pdf');
});

test('design req 3.3: an empty workspace shows the no-files empty state', async () => {
  installFakeApi();
  renderWorkspacePage();

  await waitFor(() => {
    assert.ok(screen.getByTestId(TEST_IDS.WORKSPACE_EMPTY_FILES));
  });
});

test('WF8: toggling to list view renders the sortable list instead of the grid', async () => {
  installFakeApi({
    attachments: [{ id: 'a1', filename: 'report.pdf', mimeType: 'application/pdf', pageCount: 1, folderId: null, createdAt: NOW, updatedAt: NOW }],
  });
  renderWorkspacePage();

  await waitFor(() => screen.getByTestId(TEST_IDS.FILE_GRID));
  fireEvent.click(screen.getByTestId(TEST_IDS.WORKSPACE_VIEW_LIST_BUTTON));

  await waitFor(() => {
    assert.ok(screen.getByTestId(TEST_IDS.FILE_LIST));
  });
});

test('WF11: the search bar filters the visible files client-side', async () => {
  installFakeApi({
    attachments: [
      { id: 'a1', filename: 'invoice.pdf', mimeType: 'application/pdf', pageCount: 1, folderId: null, createdAt: NOW, updatedAt: NOW },
      { id: 'a2', filename: 'contract.pdf', mimeType: 'application/pdf', pageCount: 1, folderId: null, createdAt: NOW, updatedAt: NOW },
    ],
  });
  renderWorkspacePage();

  await waitFor(() => {
    assert.equal(screen.getAllByTestId(TEST_IDS.FILE_GRID_ITEM).length, 2);
  });

  fireEvent.change(screen.getByTestId(TEST_IDS.SEARCH_INPUT), { target: { value: 'invoice' } });

  await waitFor(() => {
    const items = screen.getAllByTestId(TEST_IDS.FILE_GRID_ITEM);
    assert.equal(items.length, 1);
    assert.equal(within(items[0] as HTMLElement).getByTestId(TEST_IDS.FILE_GRID_ITEM_NAME).textContent, 'invoice.pdf');
  });
});

test('WF11: search is workspace-wide, not scoped to the folder currently being browsed', async () => {
  installFakeApi({
    folders: [{ id: 'folder-1', name: 'Reports', parentFolderId: null, createdAt: NOW, updatedAt: NOW }],
    attachments: [
      { id: 'a1', filename: 'invoice.pdf', mimeType: 'application/pdf', pageCount: 1, folderId: null, createdAt: NOW, updatedAt: NOW },
      { id: 'a2', filename: 'inside-folder.pdf', mimeType: 'application/pdf', pageCount: 1, folderId: 'folder-1', createdAt: NOW, updatedAt: NOW },
    ],
  });
  renderWorkspacePage('/workspace/folders/folder-1');

  await waitFor(() => {
    assert.equal(screen.getAllByTestId(TEST_IDS.FILE_GRID_ITEM).length, 1);
    assert.equal(screen.getByTestId(TEST_IDS.FILE_GRID_ITEM_NAME).textContent, 'inside-folder.pdf');
  });

  // Searching for a file that lives at the top level, while still browsing
  // inside "Reports", must still surface it — a folder-scoped search would
  // wrongly show zero results here.
  fireEvent.change(screen.getByTestId(TEST_IDS.SEARCH_INPUT), { target: { value: 'invoice' } });

  await waitFor(() => {
    const items = screen.getAllByTestId(TEST_IDS.FILE_GRID_ITEM);
    assert.equal(items.length, 1);
    assert.equal(within(items[0] as HTMLElement).getByTestId(TEST_IDS.FILE_GRID_ITEM_NAME).textContent, 'invoice.pdf');
  });
});

test('§4.4/WF9: deleting a file from the grid requires confirmation before it disappears', async () => {
  installFakeApi({
    attachments: [{ id: 'a1', filename: 'report.pdf', mimeType: 'application/pdf', pageCount: 1, folderId: null, createdAt: NOW, updatedAt: NOW }],
  });
  renderWorkspacePage();

  await waitFor(() => screen.getByTestId(TEST_IDS.FILE_GRID_ITEM));
  fireEvent.click(screen.getByTestId(TEST_IDS.FILE_ACTIONS_DELETE));

  const modal = screen.getByTestId(TEST_IDS.WORKSPACE_DELETE_CONFIRM_MODAL);
  assert.ok(modal, 'a confirmation modal must appear before anything is deleted');
  assert.match(screen.getByTestId(TEST_IDS.WORKSPACE_DELETE_CONFIRM_MESSAGE).textContent ?? '', /report\.pdf/);

  fireEvent.click(screen.getByTestId(TEST_IDS.WORKSPACE_DELETE_CONFIRM_BUTTON));

  await waitFor(() => {
    assert.ok(screen.getByTestId(TEST_IDS.WORKSPACE_EMPTY_FILES));
  });
});

test('§4.4/WF9: cancelling the delete confirmation leaves the file in place', async () => {
  installFakeApi({
    attachments: [{ id: 'a1', filename: 'report.pdf', mimeType: 'application/pdf', pageCount: 1, folderId: null, createdAt: NOW, updatedAt: NOW }],
  });
  renderWorkspacePage();

  await waitFor(() => screen.getByTestId(TEST_IDS.FILE_GRID_ITEM));
  fireEvent.click(screen.getByTestId(TEST_IDS.FILE_ACTIONS_DELETE));
  fireEvent.click(screen.getByTestId(TEST_IDS.WORKSPACE_DELETE_CANCEL_BUTTON));

  assert.equal(screen.queryByTestId(TEST_IDS.WORKSPACE_DELETE_CONFIRM_MODAL), null);
  assert.ok(screen.getByTestId(TEST_IDS.FILE_GRID_ITEM), 'the file must still be there after cancelling');
});

test('§4.4/WF4: deleting a folder from the sidebar also requires confirmation', async () => {
  installFakeApi({
    folders: [{ id: 'f1', name: 'Contracts', parentFolderId: null, createdAt: NOW, updatedAt: NOW }],
  });
  renderWorkspacePage();

  await waitFor(() => screen.getByTestId(folderDeleteButtonTestId('f1')));
  fireEvent.click(screen.getByTestId(folderDeleteButtonTestId('f1')));

  assert.ok(screen.getByTestId(TEST_IDS.WORKSPACE_DELETE_CONFIRM_MODAL));
  assert.match(screen.getByTestId(TEST_IDS.WORKSPACE_DELETE_CONFIRM_MESSAGE).textContent ?? '', /Contracts/);

  fireEvent.click(screen.getByTestId(TEST_IDS.WORKSPACE_DELETE_CONFIRM_BUTTON));

  await waitFor(() => {
    assert.equal(screen.queryByTestId(folderDeleteButtonTestId('f1')), null);
  });
});

test('WF3: moving a file into a folder removes it from the top-level view', async () => {
  const api = installFakeApi({
    folders: [{ id: 'f1', name: 'Contracts', parentFolderId: null, createdAt: NOW, updatedAt: NOW }],
    attachments: [{ id: 'a1', filename: 'report.pdf', mimeType: 'application/pdf', pageCount: 1, folderId: null, createdAt: NOW, updatedAt: NOW }],
  });
  renderWorkspacePage();

  await waitFor(() => screen.getByTestId(TEST_IDS.FILE_GRID_ITEM));
  fireEvent.change(screen.getByTestId(TEST_IDS.FILE_ACTIONS_MOVE_SELECT), { target: { value: 'f1' } });

  await waitFor(() => {
    assert.ok(screen.getByTestId(TEST_IDS.WORKSPACE_EMPTY_FILES));
  });
  assert.equal(api.attachments.find((a) => a.id === 'a1')?.folderId, 'f1');
});

test('WF2: creating a top-level folder from the sidebar adds it to the tree', async () => {
  installFakeApi();
  renderWorkspacePage();

  await waitFor(() => screen.getByTestId(TEST_IDS.WORKSPACE_EMPTY_FOLDERS));

  fireEvent.click(screen.getAllByTestId(TEST_IDS.FOLDER_CREATE_BUTTON)[0] as HTMLElement);
  fireEvent.change(screen.getByTestId(TEST_IDS.FOLDER_CREATE_INPUT), { target: { value: 'Contracts' } });
  fireEvent.click(screen.getByTestId(TEST_IDS.FOLDER_CREATE_CONFIRM_BUTTON));

  await waitFor(() => {
    assert.ok(screen.getByText('Contracts'));
  });
});

test('WF1/WF10: browsing into a folder shows only that folder\'s files and the breadcrumb reflects it', async () => {
  installFakeApi({
    folders: [{ id: 'f1', name: 'Contracts', parentFolderId: null, createdAt: NOW, updatedAt: NOW }],
    attachments: [
      { id: 'a1', filename: 'top-level.pdf', mimeType: 'application/pdf', pageCount: 1, folderId: null, createdAt: NOW, updatedAt: NOW },
      { id: 'a2', filename: 'in-folder.pdf', mimeType: 'application/pdf', pageCount: 1, folderId: 'f1', createdAt: NOW, updatedAt: NOW },
    ],
  });
  renderWorkspacePage('/workspace/folders/f1');

  await waitFor(() => {
    assert.equal(screen.getByTestId(TEST_IDS.FILE_GRID_ITEM_NAME).textContent, 'in-folder.pdf');
  });

  const crumbs = screen.getAllByTestId(TEST_IDS.BREADCRUMB_ITEM);
  assert.deepEqual(
    crumbs.map((c) => c.textContent),
    ['Workspace', 'Contracts'],
  );

  // WF7: Recent is a workspace-home concept — not shown while browsing inside a folder.
  assert.equal(screen.queryByTestId(TEST_IDS.RECENT_SECTION), null);
});

test('WF9: opening a file navigates to its viewer route', async () => {
  installFakeApi({
    attachments: [{ id: 'a1', filename: 'report.pdf', mimeType: 'application/pdf', pageCount: 1, folderId: null, createdAt: NOW, updatedAt: NOW }],
  });
  renderWorkspacePage();

  await waitFor(() => screen.getByTestId(TEST_IDS.FILE_ACTIONS_OPEN));
  fireEvent.click(screen.getByTestId(TEST_IDS.FILE_ACTIONS_OPEN));

  await waitFor(() => {
    assert.ok(screen.getByTestId('viewer-landed'));
  });
});
