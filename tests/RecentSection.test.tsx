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
  return { id, filename: `${id}.pdf`, mimeType: 'application/pdf', pageCount: 1, byteSize: 1048576, folderId: null, createdAt: updatedAt, updatedAt };
}

test('WF7: renders nothing when there are no files', () => {
  const { container } = render(
    <MemoryRouter>
      <RecentSection files={[]} />
    </MemoryRouter>,
  );
  assert.equal(container.textContent, '');
});

test('WF7: shows the most recently modified files first, capped at 5', () => {
  globalThis.fetch = (async () => ({ ok: true, status: 200, json: async () => ({ url: 'blob:fake' }) })) as unknown as typeof fetch;
  const files = Array.from({ length: 8 }, (_, i) => file(`a${i}`, `2026-01-0${(i % 9) + 1}T00:00:00.000Z`));
  render(
    <MemoryRouter>
      <RecentSection files={files} />
    </MemoryRouter>,
  );
  const items = screen.getAllByTestId(TEST_IDS.RECENT_ITEM);
  assert.equal(items.length, 5);
  // a7 has the latest date (2026-01-08) among the 8 fixtures.
  assert.ok((items[0]?.textContent ?? '').includes('a7.pdf'));
});

test('a file with a recently modified annotation draft floats to the top and is marked Draft', () => {
  globalThis.fetch = (async () => ({ ok: true, status: 200, json: async () => ({ url: 'blob:fake' }) })) as unknown as typeof fetch;
  const files = [
    file('newest-file', '2026-03-01T00:00:00.000Z'),
    { ...file('old-but-annotated', '2026-01-01T00:00:00.000Z'), draftUpdatedAt: '2026-04-01T00:00:00.000Z' },
    file('middle-file', '2026-02-01T00:00:00.000Z'),
  ];
  render(
    <MemoryRouter>
      <RecentSection files={files} />
    </MemoryRouter>,
  );
  const items = screen.getAllByTestId(TEST_IDS.RECENT_ITEM);
  assert.ok((items[0]?.textContent ?? '').includes('old-but-annotated.pdf'));
  assert.ok(items[0]?.querySelector('[data-testid="recent-item-draft"]'));
  assert.equal(items[1]?.querySelector('[data-testid="recent-item-draft"]'), null, 'files without a draft carry no badge');
});

test('a stale draft does not outrank a file modified after it', () => {
  globalThis.fetch = (async () => ({ ok: true, status: 200, json: async () => ({ url: 'blob:fake' }) })) as unknown as typeof fetch;
  const files = [
    { ...file('stale-draft', '2026-01-01T00:00:00.000Z'), draftUpdatedAt: '2026-01-02T00:00:00.000Z' },
    file('modified-later', '2026-02-01T00:00:00.000Z'),
  ];
  render(
    <MemoryRouter>
      <RecentSection files={files} />
    </MemoryRouter>,
  );
  assert.ok((screen.getAllByTestId(TEST_IDS.RECENT_ITEM)[0]?.textContent ?? '').includes('modified-later.pdf'));
});
