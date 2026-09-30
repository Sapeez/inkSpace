import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { setupJsdom } from './setup/jsdom';
import { TEST_IDS } from './consts/inkSpace';

setupJsdom();

const { cleanup, fireEvent, render, screen } = await import('@testing-library/react');
const { MemoryRouter } = await import('react-router-dom');
const { default: FileList } = await import('../src/workspace/FileList');

const FILES = [
  { id: 'a1', filename: 'zeta.pdf', mimeType: 'application/pdf', pageCount: 1, byteSize: 1048576, folderId: null, createdAt: '2026-01-05T00:00:00.000Z', updatedAt: '2026-01-05T00:00:00.000Z' },
  { id: 'a2', filename: 'alpha.pdf', mimeType: 'application/pdf', pageCount: 1, byteSize: 1048576, folderId: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
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

function renderedNames() {
  return screen.getAllByTestId(TEST_IDS.FILE_LIST_ITEM_NAME).map((item) => item.textContent);
}

function arrowDirections() {
  return screen.queryAllByTestId('file-list-sort-arrow').map((arrow) => arrow.getAttribute('data-direction'));
}

test('WF8: header reads "Last modified"', () => {
  render(
    <MemoryRouter>
      <FileList files={FILES} onDelete={() => {}} />
    </MemoryRouter>,
  );
  assert.equal(screen.getByTestId(TEST_IDS.FILE_LIST_SORT_DATE_BUTTON).textContent, 'Last modified');
});

test('WF8: Name is ASC by default with an up arrow only on Name; clicking it flips to DESC', () => {
  render(
    <MemoryRouter>
      <FileList files={FILES} onDelete={() => {}} />
    </MemoryRouter>,
  );
  const nameButton = screen.getByTestId(TEST_IDS.FILE_LIST_SORT_NAME_BUTTON);
  assert.deepEqual(renderedNames(), ['alpha.pdf', 'zeta.pdf']);
  assert.deepEqual(arrowDirections(), ['asc']);
  assert.ok(nameButton.querySelector('svg'));
  assert.equal(screen.getByTestId(TEST_IDS.FILE_LIST_SORT_DATE_BUTTON).querySelector('svg'), null);

  fireEvent.click(nameButton);
  assert.deepEqual(renderedNames(), ['zeta.pdf', 'alpha.pdf']);
  assert.deepEqual(arrowDirections(), ['desc']);
});

test('WF8: choosing Last modified moves the arrow there (ASC first), and clicking again flips to DESC', () => {
  render(
    <MemoryRouter>
      <FileList files={FILES} onDelete={() => {}} />
    </MemoryRouter>,
  );
  const dateButton = screen.getByTestId(TEST_IDS.FILE_LIST_SORT_DATE_BUTTON);
  fireEvent.click(dateButton);
  assert.deepEqual(renderedNames(), ['alpha.pdf', 'zeta.pdf']); // oldest first
  assert.deepEqual(arrowDirections(), ['asc']);
  assert.ok(dateButton.querySelector('svg'));
  assert.equal(screen.getByTestId(TEST_IDS.FILE_LIST_SORT_NAME_BUTTON).querySelector('svg'), null);

  fireEvent.click(dateButton);
  assert.deepEqual(renderedNames(), ['zeta.pdf', 'alpha.pdf']); // newest first
  assert.deepEqual(arrowDirections(), ['desc']);

  fireEvent.click(screen.getByTestId(TEST_IDS.FILE_LIST_SORT_NAME_BUTTON));
  assert.deepEqual(arrowDirections(), ['asc'], 'switching back to Name resets it to ASC');
  assert.equal(dateButton.querySelector('svg'), null);
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

test('pagination: shows 5 rows per page and the arrows move between pages', () => {
  const many = Array.from({ length: 7 }, (_, i) => ({
    ...FILES[0]!,
    id: `p${i}`,
    filename: `file${i}.pdf`,
  }));
  render(
    <MemoryRouter>
      <FileList files={many} onDelete={() => {}} />
    </MemoryRouter>,
  );
  assert.equal(screen.getAllByTestId(TEST_IDS.FILE_LIST_ITEM).length, 5);
  assert.equal(screen.getByTestId('file-list-page-indicator').textContent, 'Page 1 of 2');
  assert.equal((screen.getByTestId('file-list-prev-page') as HTMLButtonElement).disabled, true);

  fireEvent.click(screen.getByTestId('file-list-next-page'));
  assert.equal(screen.getAllByTestId(TEST_IDS.FILE_LIST_ITEM).length, 2);
  assert.equal(screen.getByTestId('file-list-page-indicator').textContent, 'Page 2 of 2');
  assert.equal((screen.getByTestId('file-list-next-page') as HTMLButtonElement).disabled, true);

  fireEvent.click(screen.getByTestId('file-list-prev-page'));
  assert.equal(screen.getByTestId('file-list-page-indicator').textContent, 'Page 1 of 2');
});

test('footer shows the total file count, not just the current page or filter', () => {
  render(
    <MemoryRouter>
      <FileList files={FILES} totalCount={12} onDelete={() => {}} />
    </MemoryRouter>,
  );
  assert.equal(screen.getByTestId('file-list-total').textContent, '12 files total');
});

test('a file with an annotation draft carries a Draft tag in its row; others do not', () => {
  const files = [{ ...FILES[0]!, draftUpdatedAt: '2026-03-01T00:00:00.000Z' }, FILES[1]!];
  render(
    <MemoryRouter>
      <FileList files={files} onDelete={() => {}} />
    </MemoryRouter>,
  );
  const rows = screen.getAllByTestId(TEST_IDS.FILE_LIST_ITEM);
  const withDraft = rows.find((row) => row.textContent?.includes('zeta.pdf'));
  const withoutDraft = rows.find((row) => row.textContent?.includes('alpha.pdf'));
  assert.ok(withDraft?.querySelector('[data-testid="file-list-item-draft"]'));
  assert.equal(withoutDraft?.querySelector('[data-testid="file-list-item-draft"]'), null);
});
