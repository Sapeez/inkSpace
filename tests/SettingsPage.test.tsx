import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { setupJsdom } from './setup/jsdom';
import { TEST_IDS } from './consts/inkSpace';

setupJsdom();

const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { MemoryRouter, Routes, Route } = await import('react-router-dom');
const { default: SettingsPage, DELETE_ACCOUNT_COPY } = await import('../src/routes/SettingsPage');

afterEach(() => {
  cleanup();
});

function fakeSession(overrides: { email?: string; displayName?: string } = {}) {
  return {
    user: {
      email: overrides.email ?? 'ada@example.com',
      user_metadata: overrides.displayName !== undefined ? { display_name: overrides.displayName } : {},
    },
  } as never;
}

function renderSettingsPage(overrides: {
  updateUser?: ReturnType<typeof mock.fn>;
  getUserIdentities?: ReturnType<typeof mock.fn>;
  signOut?: ReturnType<typeof mock.fn>;
  deleteAccount?: ReturnType<typeof mock.fn>;
  session?: unknown;
}) {
  const auth = {
    updateUser: overrides.updateUser ?? mock.fn(async () => ({ error: null })),
    getUserIdentities: overrides.getUserIdentities ?? mock.fn(async () => ({ data: { identities: [] }, error: null })),
    signOut: overrides.signOut ?? mock.fn(async () => ({ error: null })),
  };
  const deleteAccount = overrides.deleteAccount ?? mock.fn(async () => undefined);

  render(
    <MemoryRouter initialEntries={['/settings']}>
      <Routes>
        <Route
          path="/settings"
          element={
            <SettingsPage
              auth={auth as never}
              deleteAccount={deleteAccount as never}
              sessionOverride={(overrides.session ?? fakeSession()) as never}
            />
          }
        />
        <Route path="/signup" element={<div data-testid="signup-landed" />} />
      </Routes>
    </MemoryRouter>,
  );

  return { auth, deleteAccount };
}

test('US1: the display name field is pre-filled from the session, not blank', async () => {
  renderSettingsPage({ session: fakeSession({ displayName: 'Ada Lovelace' }) });

  await waitFor(() => {
    assert.equal((screen.getByTestId(TEST_IDS.SETTINGS_DISPLAY_NAME_INPUT) as HTMLInputElement).value, 'Ada Lovelace');
  });
});

test('US2: the email field is pre-filled from the session, not blank', async () => {
  renderSettingsPage({ session: fakeSession({ email: 'ada@example.com' }) });

  await waitFor(() => {
    assert.equal((screen.getByTestId(TEST_IDS.SETTINGS_EMAIL_INPUT) as HTMLInputElement).value, 'ada@example.com');
  });
});

test('US1: saving the profile form updates the display name via supabase.auth.updateUser', async () => {
  const { auth } = renderSettingsPage({});

  fireEvent.change(screen.getByTestId(TEST_IDS.SETTINGS_DISPLAY_NAME_INPUT), { target: { value: 'Ada Lovelace' } });
  fireEvent.click(screen.getByTestId(TEST_IDS.SETTINGS_PROFILE_SAVE_BUTTON));

  await waitFor(() => {
    assert.ok(screen.getByTestId(TEST_IDS.SETTINGS_PROFILE_SUCCESS));
  });
  assert.equal(auth.updateUser.mock.callCount(), 1);
  assert.deepEqual(auth.updateUser.mock.calls[0]?.arguments[0], { data: { display_name: 'Ada Lovelace' } });
});

test('an empty display name is rejected before calling updateUser', async () => {
  const { auth } = renderSettingsPage({});

  fireEvent.change(screen.getByTestId(TEST_IDS.SETTINGS_DISPLAY_NAME_INPUT), { target: { value: '   ' } });
  fireEvent.click(screen.getByTestId(TEST_IDS.SETTINGS_PROFILE_SAVE_BUTTON));

  await waitFor(() => {
    assert.ok(screen.getByTestId(TEST_IDS.SETTINGS_PROFILE_ERROR));
  });
  assert.equal(auth.updateUser.mock.callCount(), 0);
});

test('US2: saving the email form calls updateUser with the new email and shows the re-verification notice', async () => {
  const { auth } = renderSettingsPage({});

  fireEvent.change(screen.getByTestId(TEST_IDS.SETTINGS_EMAIL_INPUT), { target: { value: 'new@example.com' } });
  fireEvent.click(screen.getByTestId(TEST_IDS.SETTINGS_EMAIL_SAVE_BUTTON));

  await waitFor(() => {
    assert.ok(screen.getByTestId(TEST_IDS.SETTINGS_EMAIL_SUCCESS));
  });
  assert.deepEqual(auth.updateUser.mock.calls[0]?.arguments[0], { email: 'new@example.com' });
});

test('US3: mismatched password confirmation is rejected before calling updateUser', async () => {
  const { auth } = renderSettingsPage({});

  fireEvent.change(screen.getByTestId(TEST_IDS.SETTINGS_NEW_PASSWORD_INPUT), { target: { value: 'newpassword1' } });
  fireEvent.change(screen.getByTestId(TEST_IDS.SETTINGS_CONFIRM_PASSWORD_INPUT), { target: { value: 'different1' } });
  fireEvent.click(screen.getByTestId(TEST_IDS.SETTINGS_PASSWORD_SAVE_BUTTON));

  await waitFor(() => {
    assert.ok(screen.getByTestId(TEST_IDS.SETTINGS_PASSWORD_ERROR));
  });
  assert.equal(auth.updateUser.mock.callCount(), 0);
});

test('US3: a matching password confirmation calls updateUser with the new password', async () => {
  const { auth } = renderSettingsPage({});

  fireEvent.change(screen.getByTestId(TEST_IDS.SETTINGS_NEW_PASSWORD_INPUT), { target: { value: 'newpassword1' } });
  fireEvent.change(screen.getByTestId(TEST_IDS.SETTINGS_CONFIRM_PASSWORD_INPUT), { target: { value: 'newpassword1' } });
  fireEvent.click(screen.getByTestId(TEST_IDS.SETTINGS_PASSWORD_SAVE_BUTTON));

  await waitFor(() => {
    assert.ok(screen.getByTestId(TEST_IDS.SETTINGS_PASSWORD_SUCCESS));
  });
  assert.deepEqual(auth.updateUser.mock.calls[0]?.arguments[0], { password: 'newpassword1' });
});

test('US4: linked sign-in methods are listed from getUserIdentities', async () => {
  const getUserIdentities = mock.fn(async () => ({
    data: { identities: [{ identity_id: '1', provider: 'email' }] },
    error: null,
  }));
  renderSettingsPage({ getUserIdentities: getUserIdentities as never });

  await waitFor(() => {
    assert.equal(screen.getAllByTestId(TEST_IDS.SETTINGS_IDENTITY_ITEM).length, 1);
  });
});

test('US4: a failed getUserIdentities call surfaces an inline error instead of a silently empty list', async () => {
  const getUserIdentities = mock.fn(async () => ({ data: null, error: { message: 'Network error' } }));
  renderSettingsPage({ getUserIdentities: getUserIdentities as never });

  await waitFor(() => {
    assert.ok(screen.getByTestId('settings-identities-error'));
  });
});

test('US5: confirming the delete-account modal shows the exact required copy, calls deleteAccount, signs out, and redirects', async () => {
  const { auth, deleteAccount } = renderSettingsPage({});

  fireEvent.click(screen.getByTestId(TEST_IDS.SETTINGS_DELETE_ACCOUNT_BUTTON));

  assert.ok(screen.getByTestId(TEST_IDS.DELETE_ACCOUNT_MODAL));
  assert.equal(screen.getByTestId(TEST_IDS.DELETE_ACCOUNT_MODAL_TITLE).textContent, DELETE_ACCOUNT_COPY.title);
  assert.equal(screen.getByTestId(TEST_IDS.DELETE_ACCOUNT_MODAL_MESSAGE).textContent, DELETE_ACCOUNT_COPY.message);

  fireEvent.click(screen.getByTestId(TEST_IDS.DELETE_ACCOUNT_CONFIRM_BUTTON));

  await waitFor(() => {
    assert.ok(screen.getByTestId('signup-landed'));
  });
  assert.equal(deleteAccount.mock.callCount(), 1);
  assert.equal(auth.signOut.mock.callCount(), 1);
});

test('US5: cancelling the delete-account modal never calls deleteAccount', async () => {
  const { deleteAccount } = renderSettingsPage({});

  fireEvent.click(screen.getByTestId(TEST_IDS.SETTINGS_DELETE_ACCOUNT_BUTTON));
  fireEvent.click(screen.getByTestId(TEST_IDS.DELETE_ACCOUNT_CANCEL_BUTTON));

  assert.equal(screen.queryByTestId(TEST_IDS.DELETE_ACCOUNT_MODAL), null);
  assert.equal(deleteAccount.mock.callCount(), 0);
});

test('US5/§4.8: while deletion is in flight, Confirm/Cancel are visibly disabled and a double-click only deletes once', async () => {
  let resolveDelete: () => void = () => {};
  const deleteAccount = mock.fn(
    () =>
      new Promise<void>((resolve) => {
        resolveDelete = resolve;
      }),
  );
  renderSettingsPage({ deleteAccount: deleteAccount as never });

  fireEvent.click(screen.getByTestId(TEST_IDS.SETTINGS_DELETE_ACCOUNT_BUTTON));
  fireEvent.click(screen.getByTestId(TEST_IDS.DELETE_ACCOUNT_CONFIRM_BUTTON));

  const confirmButton = screen.getByTestId(TEST_IDS.DELETE_ACCOUNT_CONFIRM_BUTTON) as HTMLButtonElement;
  const cancelButton = screen.getByTestId(TEST_IDS.DELETE_ACCOUNT_CANCEL_BUTTON) as HTMLButtonElement;
  await waitFor(() => {
    assert.equal(confirmButton.disabled, true);
    assert.equal(cancelButton.disabled, true);
  });

  fireEvent.click(confirmButton);
  fireEvent.click(cancelButton);
  assert.equal(deleteAccount.mock.callCount(), 1);
  assert.ok(screen.getByTestId(TEST_IDS.DELETE_ACCOUNT_MODAL), 'the modal must still be open — cancel was disabled, not just ignored');

  resolveDelete();
  await waitFor(() => {
    assert.ok(screen.getByTestId('signup-landed'));
  });
});

test('US5/§4.8: a failed deleteAccount call keeps the modal open with the error inside it, not a silent/auto-closed failure', async () => {
  const deleteAccount = mock.fn(async () => {
    throw new Error('Could not delete account: network error');
  });
  renderSettingsPage({ deleteAccount: deleteAccount as never });

  fireEvent.click(screen.getByTestId(TEST_IDS.SETTINGS_DELETE_ACCOUNT_BUTTON));
  fireEvent.click(screen.getByTestId(TEST_IDS.DELETE_ACCOUNT_CONFIRM_BUTTON));

  await waitFor(() => {
    assert.ok(screen.getByTestId(TEST_IDS.SETTINGS_DELETE_ACCOUNT_ERROR));
  });
  assert.ok(screen.getByTestId(TEST_IDS.DELETE_ACCOUNT_MODAL), 'the modal must stay open on failure, not auto-close');

  const confirmButton = screen.getByTestId(TEST_IDS.DELETE_ACCOUNT_CONFIRM_BUTTON) as HTMLButtonElement;
  assert.equal(confirmButton.disabled, false, 're-enabled after failure so the user can retry');
});
