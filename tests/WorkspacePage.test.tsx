import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { setupJsdom } from './setup/jsdom';
import { TEST_IDS } from './consts/inkSpace';

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

interface FakeAttachment {
  id: string;
  filename: string;
  mimeType: string;
  pageCount: number | null;
  byteSize: number;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
}

function installFakeApi(initial: { attachments?: FakeAttachment[] } = {}) {
  let attachments = initial.attachments ?? [];
  let nextId = 1;

  globalThis.fetch = (async (input: unknown, init: RequestInit = {}) => {
    const url = String(input);
    const method = (init.method ?? 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body as string) : undefined;

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
      return jsonResponse(attachments);
    }
    if (url === '/api/attachments' && method === 'POST') {
      const newAttachment: FakeAttachment = {
        id: `attachment-${nextId++}`,
        filename: body.filename,
        mimeType: 'application/pdf',
        pageCount: 1,
        byteSize: 1048576,
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
    get attachments() {
      return attachments;
    },
  };
}

function renderWorkspacePage(signOut = mock.fn(async () => ({ error: null }))) {
  const auth = {
    signOut,
    updateUser: mock.fn(async () => ({ error: null })),
  };
  render(
    <MemoryRouter initialEntries={['/workspace']}>
      <Routes>
        <Route path="/workspace" element={<WorkspacePage auth={auth as never} />} />
        <Route path="/login" element={<div data-testid="login-landed" />} />
        <Route path="/edit/:attachmentId" element={<div data-testid="editor-landed" />} />
      </Routes>
    </MemoryRouter>,
  );
  return { signOut };
}

test('LG4: clicking logout calls signOut and returns to the login page', async () => {
  installFakeApi();
  const { signOut } = renderWorkspacePage();

  fireEvent.click(screen.getByTestId('account-menu-button'));
  fireEvent.click(screen.getByTestId(TEST_IDS.LOGOUT_BUTTON));

  await waitFor(() => {
    assert.ok(screen.getByTestId('login-landed'));
  });
  assert.equal(signOut.mock.callCount(), 1);
});

test('WF6: fetched attachments render as thumbnail cards with filename and date, shown in the list view', async () => {
  installFakeApi({
    attachments: [{ id: 'a1', filename: 'report.pdf', mimeType: 'application/pdf', pageCount: 1, byteSize: 1048576, folderId: null, createdAt: NOW, updatedAt: NOW }],
  });
  renderWorkspacePage();

  await waitFor(() => {
    assert.ok(screen.getByTestId(TEST_IDS.FILE_LIST));
  });
  assert.equal(screen.getByTestId(TEST_IDS.FILE_LIST_ITEM_NAME).textContent, 'report.pdf');
});

test('design req 3.3: an empty workspace shows the no-files empty state', async () => {
  installFakeApi();
  renderWorkspacePage();

  await waitFor(() => {
    assert.ok(screen.getByTestId(TEST_IDS.WORKSPACE_EMPTY_FILES));
  });
});

test('WF11: the search bar filters the visible files client-side', async () => {
  installFakeApi({
    attachments: [
      { id: 'a1', filename: 'invoice.pdf', mimeType: 'application/pdf', pageCount: 1, byteSize: 1048576, folderId: null, createdAt: NOW, updatedAt: NOW },
      { id: 'a2', filename: 'contract.pdf', mimeType: 'application/pdf', pageCount: 1, byteSize: 1048576, folderId: null, createdAt: NOW, updatedAt: NOW },
    ],
  });
  renderWorkspacePage();

  await waitFor(() => {
    assert.equal(screen.getAllByTestId(TEST_IDS.FILE_LIST_ITEM).length, 2);
  });

  fireEvent.change(screen.getByTestId(TEST_IDS.SEARCH_INPUT), { target: { value: 'invoice' } });

  await waitFor(() => {
    const items = screen.getAllByTestId(TEST_IDS.FILE_LIST_ITEM);
    assert.equal(items.length, 1);
    assert.equal(within(items[0] as HTMLElement).getByTestId(TEST_IDS.FILE_LIST_ITEM_NAME).textContent, 'invoice.pdf');
  });
});

test('the workspace lists every file in one flat list, including ones with a folderId', async () => {
  installFakeApi({
    attachments: [
      { id: 'a1', filename: 'invoice.pdf', mimeType: 'application/pdf', pageCount: 1, byteSize: 1048576, folderId: null, createdAt: NOW, updatedAt: NOW },
      { id: 'a2', filename: 'inside-folder.pdf', mimeType: 'application/pdf', pageCount: 1, byteSize: 1048576, folderId: 'folder-1', createdAt: NOW, updatedAt: NOW },
    ],
  });
  renderWorkspacePage();

  await waitFor(() => {
    assert.equal(screen.getAllByTestId(TEST_IDS.FILE_LIST_ITEM).length, 2);
  });
  assert.equal(document.querySelector('.workspace-sidebar'), null, 'the folder sidebar is gone');
});

test('§4.4/WF9: deleting a file from the grid requires confirmation before it disappears', async () => {
  installFakeApi({
    attachments: [{ id: 'a1', filename: 'report.pdf', mimeType: 'application/pdf', pageCount: 1, byteSize: 1048576, folderId: null, createdAt: NOW, updatedAt: NOW }],
  });
  renderWorkspacePage();

  await waitFor(() => screen.getByTestId(TEST_IDS.FILE_LIST_ITEM));
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
    attachments: [{ id: 'a1', filename: 'report.pdf', mimeType: 'application/pdf', pageCount: 1, byteSize: 1048576, folderId: null, createdAt: NOW, updatedAt: NOW }],
  });
  renderWorkspacePage();

  await waitFor(() => screen.getByTestId(TEST_IDS.FILE_LIST_ITEM));
  fireEvent.click(screen.getByTestId(TEST_IDS.FILE_ACTIONS_DELETE));
  fireEvent.click(screen.getByTestId(TEST_IDS.WORKSPACE_DELETE_CANCEL_BUTTON));

  assert.equal(screen.queryByTestId(TEST_IDS.WORKSPACE_DELETE_CONFIRM_MODAL), null);
  assert.ok(screen.getByTestId(TEST_IDS.FILE_LIST_ITEM), 'the file must still be there after cancelling');
});

test('WF9: clicking a file name opens the annotating editor route', async () => {
  installFakeApi({
    attachments: [{ id: 'a1', filename: 'report.pdf', mimeType: 'application/pdf', pageCount: 1, byteSize: 1048576, folderId: null, createdAt: NOW, updatedAt: NOW }],
  });
  renderWorkspacePage();

  await waitFor(() => screen.getByTestId(TEST_IDS.FILE_LIST_ITEM_NAME));
  fireEvent.click(screen.getByTestId(TEST_IDS.FILE_LIST_ITEM_NAME));

  await waitFor(() => {
    assert.ok(screen.getByTestId('editor-landed'));
  });
});

test('shows the dots loader, not the empty state, while the file list is loading', async () => {
  const pending: Array<() => void> = [];
  globalThis.fetch = (async () => {
    await new Promise<void>((resolve) => {
      pending.push(resolve);
    });
    return jsonResponse([]);
  }) as typeof fetch;
  renderWorkspacePage();

  assert.ok(screen.getByTestId('workspace-loading'));
  assert.equal(screen.queryByText(/no files/i), null, 'empty state must not show mid-load');

  await waitFor(() => assert.ok(pending.length > 0, 'list request not issued yet'));
  pending.forEach((resolve) => resolve());
  // Boolean, not assert.equal(element, null): a failed poll would make Node diff the whole jsdom node, which takes minutes.
  await waitFor(() => assert.ok(screen.queryByTestId('workspace-loading') === null, 'loader still showing'));
});

test('Settings opens as a modal over the workspace (no navigation) and closes again', async () => {
  installFakeApi();
  renderWorkspacePage();

  fireEvent.click(screen.getByTestId('account-menu-button'));
  fireEvent.click(screen.getByTestId('settings-link'));

  assert.ok(await screen.findByTestId('settings-modal'));
  assert.ok(screen.getByTestId('workspace-page'), 'the workspace stays mounted behind the modal');
  assert.equal(screen.queryByTestId('account-menu'), null, 'the account menu closes when Settings opens');

  fireEvent.click(screen.getByTestId('settings-close-button'));
  assert.equal(screen.queryByTestId('settings-modal'), null);
});

function pdfFiles(count: number): File[] {
  return Array.from({ length: count }, (_, i) => new window.File(['%PDF-1.4'], `doc${i}.pdf`, { type: 'application/pdf' }));
}

test('upload: up to 5 files can be uploaded in one go', async () => {
  const api = installFakeApi();
  renderWorkspacePage();
  await waitFor(() => assert.ok(screen.getByTestId(TEST_IDS.WORKSPACE_EMPTY_FILES)));

  fireEvent.change(screen.getByTestId('workspace-upload-input'), { target: { files: pdfFiles(5) } });

  await waitFor(() => {
    const error = screen.queryByTestId('workspace-upload-error');
    assert.equal(api.attachments.length, 5, error?.textContent ?? 'no error shown');
  });
  await waitFor(() => assert.equal(screen.getAllByTestId(TEST_IDS.FILE_LIST_ITEM).length, 5));
  // The handler's last step re-enables the button; wait for it so nothing runs after teardown.
  await waitFor(() => assert.ok(!(screen.getByTestId('workspace-upload-button') as HTMLButtonElement).disabled, 'still uploading'));
  assert.equal(screen.queryByTestId('workspace-upload-error'), null);
});

test('upload: selecting more than 5 files uploads only the first 5, with no warning', async () => {
  const api = installFakeApi();
  renderWorkspacePage();
  await waitFor(() => assert.ok(screen.getByTestId(TEST_IDS.WORKSPACE_EMPTY_FILES)));

  fireEvent.change(screen.getByTestId('workspace-upload-input'), { target: { files: pdfFiles(6) } });

  await waitFor(() => assert.equal(api.attachments.length, 5));
  // Wait for the post-upload list refresh so nothing runs after teardown.
  await waitFor(() => assert.equal(screen.getAllByTestId(TEST_IDS.FILE_LIST_ITEM).length, 5));
  // The handler's last step re-enables the button; wait for it so nothing runs after teardown.
  await waitFor(() => assert.ok(!(screen.getByTestId('workspace-upload-button') as HTMLButtonElement).disabled, 'still uploading'));
  assert.equal(screen.queryByTestId('workspace-upload-error'), null);
});
