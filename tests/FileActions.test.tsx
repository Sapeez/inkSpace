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

const FILE = { id: 'a1', filename: 'report.pdf', mimeType: 'application/pdf', pageCount: 1, folderId: null, createdAt: '', updatedAt: '' };

function renderActions(onDelete = mock.fn()) {
  render(
    <MemoryRouter initialEntries={['/workspace']}>
      <Routes>
        <Route path="/workspace" element={<FileActions file={FILE} onDelete={onDelete} />} />
        <Route path="/view/:attachmentId" element={<div data-testid="viewer-landed" />} />
      </Routes>
    </MemoryRouter>,
  );
  return { onDelete };
}

test('WF9: Open navigates to the file\'s viewer route', async () => {
  renderActions();
  fireEvent.click(screen.getByTestId(TEST_IDS.FILE_ACTIONS_OPEN));
  assert.ok(screen.getByTestId('viewer-landed'));
});

test('WF9: Delete calls onDelete with the file id', () => {
  const { onDelete } = renderActions();
  fireEvent.click(screen.getByTestId(TEST_IDS.FILE_ACTIONS_DELETE));
  assert.deepEqual(onDelete.mock.calls[0]?.arguments, ['a1']);
});

test('WF9: Download fetches the signed URL and triggers a browser download', async () => {
  globalThis.fetch = (async () => ({ ok: true, status: 200, json: async () => ({ url: 'blob:fake-url' }) })) as unknown as typeof fetch;
  const clicks: string[] = [];
  const originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
    clicks.push(this.href);
  };
  try {
    renderActions();
    fireEvent.click(screen.getByTestId(TEST_IDS.FILE_ACTIONS_DOWNLOAD));
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.ok(clicks.some((href) => href.includes('blob:fake-url')));
  } finally {
    HTMLAnchorElement.prototype.click = originalClick;
  }
});
