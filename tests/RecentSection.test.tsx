import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupJsdom } from './setup/jsdom';
import { TEST_IDS } from './consts/inkSpace';

setupJsdom();

const { cleanup, render, screen } = await import('@testing-library/react');
const { MemoryRouter } = await import('react-router-dom');
const { default: RecentSection } = await import('../src/workspace/RecentSection');

const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

function file(id: string, updatedAt: string) {
  return { id, filename: `${id}.pdf`, mimeType: 'application/pdf', pageCount: 1, folderId: null, createdAt: updatedAt, updatedAt };
}

test('WF7: renders nothing when there are no files', () => {
  const { container } = render(
    <MemoryRouter>
      <RecentSection files={[]} />
    </MemoryRouter>,
  );
  assert.equal(container.textContent, '');
});

test('WF7: shows the most recently modified files first, capped at 6', () => {
  globalThis.fetch = (async () => ({ ok: true, status: 200, json: async () => ({ url: 'blob:fake' }) })) as unknown as typeof fetch;
  const files = Array.from({ length: 8 }, (_, i) => file(`a${i}`, `2026-01-0${(i % 9) + 1}T00:00:00.000Z`));
  render(
    <MemoryRouter>
      <RecentSection files={files} />
    </MemoryRouter>,
  );
  const items = screen.getAllByTestId(TEST_IDS.RECENT_ITEM);
  assert.equal(items.length, 6);
  // a7 has the latest date (2026-01-08) among the 8 fixtures.
  assert.ok((items[0]?.textContent ?? '').includes('a7.pdf'));
});
