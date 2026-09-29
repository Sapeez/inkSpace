import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { setupJsdom } from './setup/jsdom';
import { TEST_IDS } from './consts/inkSpace';

setupJsdom();

const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { MemoryRouter, Routes, Route } = await import('react-router-dom');
const { default: WorkspaceSettingsPage } = await import('../src/workspace/WorkspaceSettingsPage');

afterEach(() => {
  cleanup();
});

function renderPage(overrides: {
  signOut?: ReturnType<typeof mock.fn>;
  deleteAccount?: ReturnType<typeof mock.fn>;
  fetchWorkspaceFn?: ReturnType<typeof mock.fn>;
  changeWorkspaceFn?: ReturnType<typeof mock.fn>;
  fetchFoldersFn?: ReturnType<typeof mock.fn>;
  fetchAttachmentsFn?: ReturnType<typeof mock.fn>;
} = {}) {
  const auth = {
    signOut: overrides.signOut ?? mock.fn(async () => ({ error: null })),
  };
  const deleteAccount = overrides.deleteAccount ?? mock.fn(async () => undefined);
  const fetchWorkspaceFn = overrides.fetchWorkspaceFn ?? mock.fn(async () => ({ displayName: 'Ada Workspace' }));
  const changeWorkspaceFn =
    overrides.changeWorkspaceFn ?? mock.fn(async (payload: { displayName: string }) => ({ displayName: payload.displayName }));
  const fetchFoldersFn = overrides.fetchFoldersFn ?? mock.fn(async () => [{ id: 'f1' }, { id: 'f2' }]);
  const fetchAttachmentsFn = overrides.fetchAttachmentsFn ?? mock.fn(async () => [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }]);

  render(
    <MemoryRouter initialEntries={['/workspace/settings']}>
      <Routes>
        <Route
          path="/workspace/settings"
          element={
            <WorkspaceSettingsPage
              auth={auth as never}
              deleteAccount={deleteAccount as never}
              fetchWorkspaceFn={fetchWorkspaceFn as never}
              changeWorkspaceFn={changeWorkspaceFn as never}
              fetchFoldersFn={fetchFoldersFn as never}
              fetchAttachmentsFn={fetchAttachmentsFn as never}
            />
          }
        />
        <Route path="/signup" element={<div data-testid="signup-landed" />} />
      </Routes>
    </MemoryRouter>,
  );

  return { auth, deleteAccount, fetchWorkspaceFn, changeWorkspaceFn, fetchFoldersFn, fetchAttachmentsFn };
}

test('WC1: the workspace name field is pre-filled from GET /api/workspace', async () => {
  renderPage({ fetchWorkspaceFn: mock.fn(async () => ({ displayName: 'Existing Name' })) as never });

  await waitFor(() => {
    assert.equal(
      (screen.getByTestId(TEST_IDS.WORKSPACE_SETTINGS_DISPLAY_NAME_INPUT) as HTMLInputElement).value,
      'Existing Name',
    );
  });
});

test('WC1: saving the form calls PATCH /api/workspace with the new display name', async () => {
  const { changeWorkspaceFn } = renderPage();

  await waitFor(() => {
    assert.equal((screen.getByTestId(TEST_IDS.WORKSPACE_SETTINGS_DISPLAY_NAME_INPUT) as HTMLInputElement).value, 'Ada Workspace');
  });

  fireEvent.change(screen.getByTestId(TEST_IDS.WORKSPACE_SETTINGS_DISPLAY_NAME_INPUT), { target: { value: 'New Name' } });
  fireEvent.click(screen.getByTestId(TEST_IDS.WORKSPACE_SETTINGS_SAVE_BUTTON));

  await waitFor(() => {
    assert.ok(screen.getByTestId(TEST_IDS.WORKSPACE_SETTINGS_SUCCESS));
  });
  assert.deepEqual(changeWorkspaceFn.mock.calls[0]?.arguments[0], { displayName: 'New Name' });
});

test('an empty workspace name is rejected before calling changeWorkspace', async () => {
  const { changeWorkspaceFn } = renderPage();

  fireEvent.change(screen.getByTestId(TEST_IDS.WORKSPACE_SETTINGS_DISPLAY_NAME_INPUT), { target: { value: '   ' } });
  fireEvent.click(screen.getByTestId(TEST_IDS.WORKSPACE_SETTINGS_SAVE_BUTTON));

  await waitFor(() => {
    assert.ok(screen.getByTestId(TEST_IDS.WORKSPACE_SETTINGS_ERROR));
  });
  assert.equal(changeWorkspaceFn.mock.callCount(), 0);
});

test('WC2/WC3: opening the delete modal shows the exact file/folder counts before proceeding', async () => {
  renderPage({
    fetchFoldersFn: mock.fn(async () => [{ id: 'f1' }]) as never,
    fetchAttachmentsFn: mock.fn(async () => [{ id: 'a1' }, { id: 'a2' }]) as never,
  });

  fireEvent.click(screen.getByTestId(TEST_IDS.WORKSPACE_SETTINGS_DELETE_BUTTON));

  await waitFor(() => {
    const message = screen.getByTestId(TEST_IDS.WORKSPACE_SETTINGS_DELETE_MODAL_MESSAGE).textContent ?? '';
    assert.match(message, /2 files/);
    assert.match(message, /1 folder/);
  });
});

test('WC2/WC3: Confirm stays disabled until the counts fetch settles, so a fast click can\'t skip past the required copy', async () => {
  let resolveCounts: (value: unknown[]) => void = () => {};
  const fetchAttachmentsFn = mock.fn(() => new Promise<unknown[]>((resolve) => { resolveCounts = resolve; }));
  renderPage({ fetchAttachmentsFn: fetchAttachmentsFn as never });

  fireEvent.click(screen.getByTestId(TEST_IDS.WORKSPACE_SETTINGS_DELETE_BUTTON));
  await waitFor(() => {
    assert.ok(screen.getByTestId(TEST_IDS.WORKSPACE_SETTINGS_DELETE_MODAL));
  });

  const confirmButton = screen.getByTestId(TEST_IDS.WORKSPACE_SETTINGS_DELETE_CONFIRM_BUTTON) as HTMLButtonElement;
  assert.equal(confirmButton.disabled, true, 'Confirm must be disabled until the counts are known');

  resolveCounts([{ id: 'a1' }]);
  await waitFor(() => {
    assert.equal(confirmButton.disabled, false);
  });
});

test('a failed counts fetch surfaces an inline note and still allows the user to proceed', async () => {
  renderPage({ fetchFoldersFn: mock.fn(async () => { throw new Error('Network error'); }) as never });

  fireEvent.click(screen.getByTestId(TEST_IDS.WORKSPACE_SETTINGS_DELETE_BUTTON));

  await waitFor(() => {
    const message = screen.getByTestId(TEST_IDS.WORKSPACE_SETTINGS_DELETE_MODAL_MESSAGE).textContent ?? '';
    assert.match(message, /couldn't confirm/i);
  });
  const confirmButton = screen.getByTestId(TEST_IDS.WORKSPACE_SETTINGS_DELETE_CONFIRM_BUTTON) as HTMLButtonElement;
  assert.equal(confirmButton.disabled, false, 'a settled failure still lets the user proceed, just without exact counts');
});

test('WC2/WC3/R2: confirming the delete-workspace modal calls deleteAccount, signs out, and redirects', async () => {
  const { auth, deleteAccount } = renderPage();

  fireEvent.click(screen.getByTestId(TEST_IDS.WORKSPACE_SETTINGS_DELETE_BUTTON));
  const confirmButton = screen.getByTestId(TEST_IDS.WORKSPACE_SETTINGS_DELETE_CONFIRM_BUTTON) as HTMLButtonElement;
  await waitFor(() => {
    assert.equal(confirmButton.disabled, false);
  });

  fireEvent.click(confirmButton);

  await waitFor(() => {
    assert.ok(screen.getByTestId('signup-landed'));
  });
  assert.equal(deleteAccount.mock.callCount(), 1);
  assert.equal(auth.signOut.mock.callCount(), 1);
});

test('cancelling the delete-workspace modal never calls deleteAccount', async () => {
  const { deleteAccount } = renderPage();

  fireEvent.click(screen.getByTestId(TEST_IDS.WORKSPACE_SETTINGS_DELETE_BUTTON));
  await waitFor(() => {
    assert.ok(screen.getByTestId(TEST_IDS.WORKSPACE_SETTINGS_DELETE_MODAL));
  });
  fireEvent.click(screen.getByTestId(TEST_IDS.WORKSPACE_SETTINGS_DELETE_CANCEL_BUTTON));

  assert.equal(screen.queryByTestId(TEST_IDS.WORKSPACE_SETTINGS_DELETE_MODAL), null);
  assert.equal(deleteAccount.mock.callCount(), 0);
});

test('§4.8: while deletion is in flight, Confirm/Cancel are visibly disabled', async () => {
  let resolveDelete: () => void = () => {};
  const deleteAccount = mock.fn(
    () =>
      new Promise<void>((resolve) => {
        resolveDelete = resolve;
      }),
  );
  renderPage({ deleteAccount: deleteAccount as never });

  fireEvent.click(screen.getByTestId(TEST_IDS.WORKSPACE_SETTINGS_DELETE_BUTTON));
  const confirmButton = screen.getByTestId(TEST_IDS.WORKSPACE_SETTINGS_DELETE_CONFIRM_BUTTON) as HTMLButtonElement;
  const cancelButton = screen.getByTestId(TEST_IDS.WORKSPACE_SETTINGS_DELETE_CANCEL_BUTTON) as HTMLButtonElement;
  await waitFor(() => {
    assert.equal(confirmButton.disabled, false);
  });
  fireEvent.click(confirmButton);

  await waitFor(() => {
    assert.equal(confirmButton.disabled, true);
    assert.equal(cancelButton.disabled, true);
  });

  resolveDelete();
  await waitFor(() => {
    assert.ok(screen.getByTestId('signup-landed'));
  });
});

test('§4.8: a failed deleteAccount call keeps the modal open with the error inside it', async () => {
  const deleteAccount = mock.fn(async () => {
    throw new Error('Could not delete workspace: network error');
  });
  renderPage({ deleteAccount: deleteAccount as never });

  fireEvent.click(screen.getByTestId(TEST_IDS.WORKSPACE_SETTINGS_DELETE_BUTTON));
  const initialConfirmButton = screen.getByTestId(TEST_IDS.WORKSPACE_SETTINGS_DELETE_CONFIRM_BUTTON) as HTMLButtonElement;
  await waitFor(() => {
    assert.equal(initialConfirmButton.disabled, false);
  });
  fireEvent.click(initialConfirmButton);

  await waitFor(() => {
    assert.ok(screen.getByTestId(TEST_IDS.WORKSPACE_SETTINGS_DELETE_ERROR));
  });
  assert.ok(screen.getByTestId(TEST_IDS.WORKSPACE_SETTINGS_DELETE_MODAL), 'the modal must stay open on failure');
  const confirmButton = screen.getByTestId(TEST_IDS.WORKSPACE_SETTINGS_DELETE_CONFIRM_BUTTON) as HTMLButtonElement;
  assert.equal(confirmButton.disabled, false, 're-enabled after failure so the user can retry');
});
