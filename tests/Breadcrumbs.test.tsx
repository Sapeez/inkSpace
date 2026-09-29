import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupJsdom } from './setup/jsdom';
import { TEST_IDS } from './consts/inkSpace';

setupJsdom();

const { cleanup, render, screen } = await import('@testing-library/react');
const { MemoryRouter } = await import('react-router-dom');
const { default: Breadcrumbs } = await import('../src/workspace/Breadcrumbs');

afterEach(() => {
  cleanup();
});

const FOLDERS = [
  { id: 'root-folder', name: 'Contracts', parentFolderId: null, createdAt: '', updatedAt: '' },
  { id: 'nested-folder', name: '2026', parentFolderId: 'root-folder', createdAt: '', updatedAt: '' },
];

test('WF10: at the workspace root, only the "Workspace" crumb renders', () => {
  render(
    <MemoryRouter>
      <Breadcrumbs folders={FOLDERS} currentFolderId={null} />
    </MemoryRouter>,
  );
  assert.equal(screen.getAllByTestId(TEST_IDS.BREADCRUMB_ITEM).length, 1);
});

test('WF10: inside a nested folder, the full ancestor chain renders in order', () => {
  render(
    <MemoryRouter>
      <Breadcrumbs folders={FOLDERS} currentFolderId="nested-folder" />
    </MemoryRouter>,
  );
  const crumbs = screen.getAllByTestId(TEST_IDS.BREADCRUMB_ITEM);
  assert.deepEqual(
    crumbs.map((c) => c.textContent),
    ['Workspace', 'Contracts', '2026'],
  );
});
