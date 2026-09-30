import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { setupJsdom } from './setup/jsdom';

setupJsdom();

const { cleanup, renderHook, waitFor, act } = await import('@testing-library/react');
const { useAnnotationDraft } = await import('../src/viewer/useAnnotationDraft');

const originalFetch = globalThis.fetch;
const PAGES = [{ pageNumber: 1, objects: [{ type: 'Rect', left: 5 }] }];
const LOCAL_KEY = 'inkspace:draft:att-1';

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  window.localStorage.clear();
});

function json(body: unknown, status = 200): Response {
  return { ok: status < 400, status, json: async () => body } as Response;
}

function fakeCanvas(pages = PAGES) {
  return {
    current: {
      getDraftPages: mock.fn(() => pages),
      restoreDraft: mock.fn(async (_pages: unknown) => true),
    },
  };
}

function installFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  globalThis.fetch = (async (input: unknown, init: RequestInit = {}) => {
    calls.push({ url: String(input), method: (init.method ?? 'GET').toUpperCase(), body: init.body ? JSON.parse(init.body as string) : undefined });
    return handler(String(input), init);
  }) as typeof fetch;
  return calls;
}

test('restores the server draft into the canvas once the document is ready', async () => {
  installFetch(() => json({ pages: PAGES, updatedAt: '2026-01-01T00:00:00.000Z' }));
  const canvasRef = fakeCanvas();
  renderHook(() => useAnnotationDraft({ attachmentId: 'att-1', ready: true, canvasRef: canvasRef as never }));

  await waitFor(() => assert.equal(canvasRef.current.restoreDraft.mock.callCount(), 1));
  assert.deepEqual(canvasRef.current.restoreDraft.mock.calls[0]?.arguments[0], PAGES);
});

test('does nothing until the document is ready, and does not restore an empty draft', async () => {
  const calls = installFetch(() => json({ pages: [], updatedAt: null }));
  const canvasRef = fakeCanvas();
  const { rerender } = renderHook(
    ({ ready }) => useAnnotationDraft({ attachmentId: 'att-1', ready, canvasRef: canvasRef as never }),
    { initialProps: { ready: false } },
  );
  assert.equal(calls.length, 0);

  rerender({ ready: true });
  await waitFor(() => assert.equal(calls.length, 1));
  assert.equal(canvasRef.current.restoreDraft.mock.callCount(), 0);
});

test('flush saves the canvas draft to the server and then drops the local backup', async () => {
  const calls = installFetch(() => json({ updatedAt: '2026-01-01T00:00:00.000Z' }));
  const canvasRef = fakeCanvas();
  const { result } = renderHook(() => useAnnotationDraft({ attachmentId: 'att-1', ready: false, canvasRef: canvasRef as never }));

  act(() => result.current.notifyChange());
  let ok = false;
  await act(async () => {
    ok = await result.current.flush();
  });

  assert.equal(ok, true);
  const put = calls.find((call) => call.method === 'PUT');
  assert.equal(put?.url, '/api/attachments/att-1/draft');
  assert.deepEqual(put?.body, { pages: PAGES });
  assert.equal(window.localStorage.getItem(LOCAL_KEY), null, 'synced work is not kept locally');
  await waitFor(() => assert.equal(result.current.status, 'saved'));
});

test('a failed save keeps the local backup, reports the error, and flush returns false', async () => {
  installFetch(() => json({ message: 'boom' }, 500));
  const canvasRef = fakeCanvas();
  const { result } = renderHook(() => useAnnotationDraft({ attachmentId: 'att-1', ready: false, canvasRef: canvasRef as never }));

  act(() => result.current.notifyChange());
  let ok = true;
  await act(async () => {
    ok = await result.current.flush();
  });

  assert.equal(ok, false);
  assert.ok(window.localStorage.getItem(LOCAL_KEY), 'unsynced work stays in this browser');
  await waitFor(() => assert.equal(result.current.status, 'error'));
});

test('newer unsynced local work wins over an older server draft and is pushed to the server', async () => {
  const older = [{ pageNumber: 1, objects: [{ type: 'Rect', left: 1 }] }];
  const newer = [{ pageNumber: 2, objects: [{ type: 'Rect', left: 9 }] }];
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify({ pages: newer, savedAt: Date.parse('2026-02-01T00:00:00.000Z') }));
  const calls = installFetch((_url, init) =>
    init.method === 'PUT' ? json({ updatedAt: 'x' }) : json({ pages: older, updatedAt: '2026-01-01T00:00:00.000Z' }),
  );
  const canvasRef = fakeCanvas(newer);
  renderHook(() => useAnnotationDraft({ attachmentId: 'att-1', ready: true, canvasRef: canvasRef as never }));

  await waitFor(() => assert.equal(canvasRef.current.restoreDraft.mock.callCount(), 1));
  assert.deepEqual(canvasRef.current.restoreDraft.mock.calls[0]?.arguments[0], newer);
  await waitFor(() => assert.ok(calls.some((call) => call.method === 'PUT')));
});

test('an older local copy does not shadow a newer server draft (e.g. edited on another computer)', async () => {
  const local = [{ pageNumber: 1, objects: [{ type: 'Rect', left: 1 }] }];
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify({ pages: local, savedAt: Date.parse('2026-01-01T00:00:00.000Z') }));
  installFetch(() => json({ pages: PAGES, updatedAt: '2026-02-01T00:00:00.000Z' }));
  const canvasRef = fakeCanvas();
  renderHook(() => useAnnotationDraft({ attachmentId: 'att-1', ready: true, canvasRef: canvasRef as never }));

  await waitFor(() => assert.equal(canvasRef.current.restoreDraft.mock.callCount(), 1));
  assert.deepEqual(canvasRef.current.restoreDraft.mock.calls[0]?.arguments[0], PAGES);
});
