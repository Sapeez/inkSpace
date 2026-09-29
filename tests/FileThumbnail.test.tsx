import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupJsdom } from './setup/jsdom';
import { TEST_IDS } from './consts/inkSpace';

setupJsdom();

const { cleanup, render, screen, waitFor } = await import('@testing-library/react');
const { default: FileThumbnail } = await import('../src/workspace/FileThumbnail');

const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

// pdf.js's real worker module is dynamically imported by FileThumbnail's own
// render effect (see its comment) — after the fallback UI is visible, that
// import chain can still have trailing microtasks in flight. A short settle
// delay here keeps this test's own async activity from leaking past its end
// and racing this file's jsdom teardown (`setupJsdom`'s `after` hook).
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 50));
}

test('WF6: renders a fallback instead of crashing when the attachment fetch fails', async () => {
  globalThis.fetch = (async () => ({ ok: false, status: 404, json: async () => ({ message: 'Not found' }) })) as unknown as typeof fetch;

  render(<FileThumbnail attachmentId="missing" />);

  await waitFor(() => {
    const node = screen.getByTestId(TEST_IDS.FILE_THUMBNAIL);
    assert.equal(node.tagName, 'DIV');
  });
  await settle();
});

test('WF6: renders a fallback when the fetched URL is not a real PDF (pdf.js load failure)', async () => {
  globalThis.fetch = (async () => ({ ok: true, status: 200, json: async () => ({ url: 'blob:not-a-real-pdf' }) })) as unknown as typeof fetch;

  render(<FileThumbnail attachmentId="a1" />);

  await waitFor(() => {
    const node = screen.getByTestId(TEST_IDS.FILE_THUMBNAIL);
    assert.equal(node.tagName, 'DIV');
  });
  await settle();
});
