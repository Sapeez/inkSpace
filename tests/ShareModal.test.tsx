import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupJsdom } from './setup/jsdom';
import { TEST_IDS } from './consts/inkSpace';

setupJsdom();

const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { default: ShareModal } = await import('../src/modals/ShareModal');

const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response;
}

test('P1: lists the current shares on open', async () => {
  globalThis.fetch = (async () =>
    jsonResponse([{ id: 'share-1', granteeEmail: 'viewer@example.com', role: 'view' }])) as typeof fetch;

  render(<ShareModal open attachmentId="attachment-1" onClose={() => {}} />);

  await waitFor(() => {
    assert.equal(screen.getAllByTestId(TEST_IDS.SHARE_LIST_ITEM).length, 1);
  });
  assert.ok(screen.getByText('viewer@example.com'));
});

test('P1: submitting the form grants a new share and adds it to the list', async () => {
  globalThis.fetch = (async (url: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      return jsonResponse({ id: 'share-2', granteeEmail: 'editor@example.com', role: 'edit' });
    }
    return jsonResponse([]);
  }) as typeof fetch;

  render(<ShareModal open attachmentId="attachment-1" onClose={() => {}} />);

  await waitFor(() => {
    assert.ok(screen.getByText('Not shared with anyone yet.'));
  });

  fireEvent.change(screen.getByTestId(TEST_IDS.SHARE_EMAIL_INPUT), { target: { value: 'editor@example.com' } });
  fireEvent.change(screen.getByTestId(TEST_IDS.SHARE_ROLE_SELECT), { target: { value: 'edit' } });
  fireEvent.click(screen.getByTestId(TEST_IDS.SHARE_CONFIRM_BUTTON));

  await waitFor(() => {
    assert.equal(screen.getAllByTestId(TEST_IDS.SHARE_LIST_ITEM).length, 1);
  });
  assert.ok(screen.getByText('editor@example.com'));
});

test('P1: revoking a share removes it from the list', async () => {
  globalThis.fetch = (async (url: string, options?: RequestInit) => {
    if (options?.method === 'DELETE') return jsonResponse(null);
    return jsonResponse([{ id: 'share-1', granteeEmail: 'viewer@example.com', role: 'view' }]);
  }) as typeof fetch;

  render(<ShareModal open attachmentId="attachment-1" onClose={() => {}} />);

  await waitFor(() => {
    assert.equal(screen.getAllByTestId(TEST_IDS.SHARE_LIST_ITEM).length, 1);
  });

  fireEvent.click(screen.getByTestId(TEST_IDS.SHARE_REVOKE_BUTTON));

  await waitFor(() => {
    assert.equal(screen.queryAllByTestId(TEST_IDS.SHARE_LIST_ITEM).length, 0);
  });
});

test('a failed grant shows an inline error and does not close the modal', async () => {
  globalThis.fetch = (async (url: string, options?: RequestInit) => {
    if (options?.method === 'POST') return jsonResponse({ message: 'A valid email address is required' }, false);
    return jsonResponse([]);
  }) as typeof fetch;

  render(<ShareModal open attachmentId="attachment-1" onClose={() => {}} />);

  await waitFor(() => {
    assert.ok(screen.getByText('Not shared with anyone yet.'));
  });

  fireEvent.change(screen.getByTestId(TEST_IDS.SHARE_EMAIL_INPUT), { target: { value: 'someone@example.com' } });
  fireEvent.click(screen.getByTestId(TEST_IDS.SHARE_CONFIRM_BUTTON));

  await waitFor(() => {
    assert.equal(
      screen.getByTestId(TEST_IDS.SHARE_FORM_ERROR).textContent,
      'A valid email address is required',
    );
  });
  assert.ok(screen.getByTestId(TEST_IDS.SHARE_MODAL));
});

test('the close button calls onClose', async () => {
  globalThis.fetch = (async () => jsonResponse([])) as typeof fetch;
  let closed = false;

  render(
    <ShareModal
      open
      attachmentId="attachment-1"
      onClose={() => {
        closed = true;
      }}
    />,
  );

  fireEvent.click(screen.getByTestId(TEST_IDS.SHARE_MODAL_CLOSE_BUTTON));
  assert.equal(closed, true);
});

test('renders nothing when closed', () => {
  render(<ShareModal open={false} attachmentId="attachment-1" onClose={() => {}} />);
  assert.equal(screen.queryByTestId(TEST_IDS.SHARE_MODAL), null);
});

test('a malformed shares list response is surfaced as an error, not rendered as-is', async () => {
  globalThis.fetch = (async () => jsonResponse([{ id: 'share-1' }])) as typeof fetch;

  render(<ShareModal open attachmentId="attachment-1" onClose={() => {}} />);

  await waitFor(() => {
    assert.ok(screen.getByTestId(TEST_IDS.SHARE_LIST_ERROR));
  });
  assert.equal(screen.queryAllByTestId(TEST_IDS.SHARE_LIST_ITEM).length, 0);
});
