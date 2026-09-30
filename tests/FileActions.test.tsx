import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { setupJsdom } from './setup/jsdom';
import { TEST_IDS } from './consts/inkSpace';

setupJsdom();

const { cleanup, fireEvent, render, screen } = await import('@testing-library/react');
const { MemoryRouter, Routes, Route } = await import('react-router-dom');
const { default: FileActions } = await import('../src/workspace/FileActions');

const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

const FILE = { id: 'a1', filename: 'report.pdf', mimeType: 'application/pdf', pageCount: 1, byteSize: 1048576, folderId: null, createdAt: '', updatedAt: '' };

function renderActions(onDelete = mock.fn()) {
  render(
    <MemoryRouter initialEntries={['/workspace']}>
      <Routes>
        <Route path="/workspace" element={<FileActions file={FILE} onDelete={onDelete} />} />
        <Route path="/edit/:attachmentId" element={<div data-testid="editor-landed" />} />
      </Routes>
    </MemoryRouter>,
  );
  return { onDelete };
}

test('WF9: Edit navigates to the file\'s annotating editor route', async () => {
  renderActions();
  fireEvent.click(screen.getByTestId(TEST_IDS.FILE_ACTIONS_OPEN));
  assert.ok(screen.getByTestId('editor-landed'));
});

test('WF9: Delete calls onDelete with the file id', () => {
  const { onDelete } = renderActions();
  fireEvent.click(screen.getByTestId(TEST_IDS.FILE_ACTIONS_DELETE));
  assert.deepEqual(onDelete.mock.calls[0]?.arguments, ['a1']);
});

test('WF9: Download fetches the file bytes and saves them under the original filename', async () => {
  const requested: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requested.push(String(input));
    return {
      ok: true,
      status: 200,
      json: async () => ({ url: 'https://storage.example/signed.pdf' }),
      blob: async () => new Blob(['%PDF'], { type: 'application/pdf' }),
    };
  }) as unknown as typeof fetch;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = () => 'blob:saved-file';
  URL.revokeObjectURL = () => {};
  const saved: { href: string; download: string }[] = [];
  const originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
    saved.push({ href: this.href, download: this.download });
  };
  try {
    renderActions();
    fireEvent.click(screen.getByTestId(TEST_IDS.FILE_ACTIONS_DOWNLOAD));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(requested.includes('https://storage.example/signed.pdf'));
    assert.equal(saved.length, 1);
    assert.equal(saved[0]?.href, 'blob:saved-file');
    assert.equal(saved[0]?.download, 'report.pdf');
  } finally {
    HTMLAnchorElement.prototype.click = originalClick;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
});

test('WF9: Download shows an error when the storage fetch fails', async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (String(input).includes('storage.example')) return { ok: false, status: 403 };
    return { ok: true, status: 200, json: async () => ({ url: 'https://storage.example/signed.pdf' }) };
  }) as unknown as typeof fetch;
  renderActions();
  fireEvent.click(screen.getByTestId(TEST_IDS.FILE_ACTIONS_DOWNLOAD));
  const alert = await screen.findByTestId('file-actions-download-error');
  assert.match(alert.textContent ?? '', /report\.pdf/);
});

test('WF9: Download shows an error when the request rejects', async () => {
  globalThis.fetch = (async () => {
    throw new Error('network down');
  }) as unknown as typeof fetch;
  renderActions();
  fireEvent.click(screen.getByTestId(TEST_IDS.FILE_ACTIONS_DOWNLOAD));
  assert.ok(await screen.findByTestId('file-actions-download-error'));
});
