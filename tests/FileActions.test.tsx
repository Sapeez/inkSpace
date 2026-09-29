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
const FOLDERS = [{ id: 'f1', name: 'Contracts', parentFolderId: null, createdAt: '', updatedAt: '' }];

function renderActions(onMove = mock.fn(), onDelete = mock.fn()) {
  render(
    <MemoryRouter initialEntries={['/workspace']}>
      <Routes>
        <Route path="/workspace" element={<FileActions file={FILE} folders={FOLDERS} onMove={onMove} onDelete={onDelete} />} />
        <Route path="/view/:attachmentId" element={<div data-testid="viewer-landed" />} />
      </Routes>
    </MemoryRouter>,
  );
  return { onMove, onDelete };
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

test('WF3: choosing a folder from the move select calls onMove with that folder id', () => {
  const { onMove } = renderActions();
  fireEvent.change(screen.getByTestId(TEST_IDS.FILE_ACTIONS_MOVE_SELECT), { target: { value: 'f1' } });
  assert.deepEqual(onMove.mock.calls[0]?.arguments, ['a1', 'f1']);
});

test('WF3: choosing "Top level" calls onMove with null', () => {
  const { onMove } = renderActions();
  const select = screen.getByTestId(TEST_IDS.FILE_ACTIONS_MOVE_SELECT);
  fireEvent.change(select, { target: { value: 'f1' } });
  fireEvent.change(select, { target: { value: '' } });
  assert.deepEqual(onMove.mock.calls[1]?.arguments, ['a1', null]);
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
