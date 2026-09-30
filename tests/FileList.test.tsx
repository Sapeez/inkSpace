import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { setupJsdom } from './setup/jsdom';
import { TEST_IDS } from './consts/inkSpace';

setupJsdom();

const { cleanup, fireEvent, render, screen } = await import('@testing-library/react');
const { MemoryRouter } = await import('react-router-dom');
const { default: FileList } = await import('../src/workspace/FileList');

const FILES = [
  { id: 'a1', filename: 'zeta.pdf', mimeType: 'application/pdf', pageCount: 1, byteSize: 1048576, folderId: null, createdAt: '', updatedAt: '2026-01-05T00:00:00.000Z' },
  { id: 'a2', filename: 'alpha.pdf', mimeType: 'application/pdf', pageCount: 1, byteSize: 1048576, folderId: null, createdAt: '', updatedAt: '2026-01-01T00:00:00.000Z' },
];

afterEach(() => {
  cleanup();
});

test('WF6: with no files, the empty-files state renders', () => {
  render(
    <MemoryRouter>
      <FileList files={[]} onDelete={() => {}} />
    </MemoryRouter>,
  );
  assert.ok(screen.getByTestId(TEST_IDS.WORKSPACE_EMPTY_FILES));
});

test('WF8: defaults to name sort order', () => {
  render(
    <MemoryRouter>
      <FileList files={FILES} onDelete={() => {}} />
    </MemoryRouter>,
  );
  const names = screen.getAllByTestId(TEST_IDS.FILE_LIST_ITEM).map((item) => item.textContent);
  assert.ok((names[0] ?? '').includes('alpha.pdf'));
});

test('WF8: switching to date sort reorders by last-modified, most recent first', () => {
  render(
    <MemoryRouter>
      <FileList files={FILES} onDelete={() => {}} />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByTestId(TEST_IDS.FILE_LIST_SORT_DATE_BUTTON));
  const names = screen.getAllByTestId(TEST_IDS.FILE_LIST_ITEM).map((item) => item.textContent);
  assert.ok((names[0] ?? '').includes('zeta.pdf'));
});

test('WF9: clicking delete on a row calls onDelete with the file id', () => {
  const onDelete = mock.fn();
  render(
    <MemoryRouter>
      <FileList files={[FILES[0]!]} onDelete={onDelete} />
    </MemoryRouter>,
  );
  screen.getByTestId(TEST_IDS.FILE_ACTIONS_DELETE).click();
  assert.deepEqual(onDelete.mock.calls[0]?.arguments, ['a1']);
});
