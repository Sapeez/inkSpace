import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { setupJsdom } from './setup/jsdom';
import { TEST_IDS } from './consts/inkSpace';

setupJsdom();

const { cleanup, render, screen } = await import('@testing-library/react');
const { MemoryRouter } = await import('react-router-dom');
const { default: FileGrid } = await import('../src/workspace/FileGrid');

const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

const FILE = { id: 'a1', filename: 'report.pdf', mimeType: 'application/pdf', pageCount: 1, folderId: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' };

test('WF6: with no files, the empty-files state renders instead of an empty grid', () => {
  globalThis.fetch = (async () => ({ ok: true, status: 200, json: async () => ({}) })) as unknown as typeof fetch;
  render(
    <MemoryRouter>
      <FileGrid files={[]} folders={[]} onMove={() => {}} onDelete={() => {}} />
    </MemoryRouter>,
  );
  assert.ok(screen.getByTestId(TEST_IDS.WORKSPACE_EMPTY_FILES));
});

test('WF6/WF9: a file renders its name, date, and actions', () => {
  globalThis.fetch = (async () => ({ ok: true, status: 200, json: async () => ({ url: 'blob:fake' }) })) as unknown as typeof fetch;
  render(
    <MemoryRouter>
      <FileGrid files={[FILE]} folders={[]} onMove={() => {}} onDelete={() => {}} />
    </MemoryRouter>,
  );
  assert.equal(screen.getByTestId(TEST_IDS.FILE_GRID_ITEM_NAME).textContent, 'report.pdf');
  assert.ok(screen.getByTestId(TEST_IDS.FILE_ACTIONS_DELETE));
});

test('WF9: clicking delete on a card calls onDelete with the file id', () => {
  globalThis.fetch = (async () => ({ ok: true, status: 200, json: async () => ({ url: 'blob:fake' }) })) as unknown as typeof fetch;
  const onDelete = mock.fn();
  render(
    <MemoryRouter>
      <FileGrid files={[FILE]} folders={[]} onMove={() => {}} onDelete={onDelete} />
    </MemoryRouter>,
  );
  screen.getByTestId(TEST_IDS.FILE_ACTIONS_DELETE).click();
  assert.deepEqual(onDelete.mock.calls[0]?.arguments, ['a1']);
});
