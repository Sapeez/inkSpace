import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { setupJsdom } from './setup/jsdom';
import { TEST_IDS } from './consts/inkSpace';

setupJsdom();

const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { MemoryRouter, Routes, Route } = await import('react-router-dom');
const { default: SettingsModal, DELETE_ACCOUNT_COPY } = await import('../src/modals/SettingsModal');

afterEach(() => {
  cleanup();
});

function fakeSession(overrides: { email?: string } = {}) {
  return { user: { email: overrides.email ?? 'ada@example.com', user_metadata: {} } } as never;
}

function renderSettingsModal(overrides: {
  updateUser?: ReturnType<typeof mock.fn>;
  signOut?: ReturnType<typeof mock.fn>;
  deleteAccount?: ReturnType<typeof mock.fn>;
  session?: unknown;
  onClose?: ReturnType<typeof mock.fn>;
}) {
  const auth = {
    updateUser: overrides.updateUser ?? mock.fn(async () => ({ error: null })),
    signOut: overrides.signOut ?? mock.fn(async () => ({ error: null })),
  };
  const deleteAccount = overrides.deleteAccount ?? mock.fn(async () => undefined);

  render(
    <MemoryRouter initialEntries={['/settings']}>
      <Routes>
        <Route
          path="/settings"
          element={
            <SettingsModal
              open
              onClose={(overrides.onClose ?? (() => {})) as never}
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

test('the email is shown pre-filled from the session, as a disabled read-only field', async () => {
  renderSettingsModal({ session: fakeSession({ email: 'ada@example.com' }) });

  await waitFor(() => {
    assert.equal((screen.getByTestId(TEST_IDS.SETTINGS_EMAIL_INPUT) as HTMLInputElement).value, 'ada@example.com');
  });
  const input = screen.getByTestId(TEST_IDS.SETTINGS_EMAIL_INPUT) as HTMLInputElement;
  assert.equal(input.disabled, true);
  assert.equal(input.readOnly, true);
  assert.equal(screen.queryByTestId('settings-email-save-button'), null);
  assert.equal(screen.queryByTestId('settings-display-name-input'), null, 'the profile display name is gone');
  assert.equal(screen.queryByText(/linked sign-in methods/i), null, 'the linked sign-in methods section is gone');
});

test('sections are separated by dividers (email | password | danger zone)', () => {
  renderSettingsModal({});
  assert.equal(screen.getByTestId('settings-modal').querySelectorAll('hr.settings-divider').length, 2);
});

test('the close button and Escape both call onClose', () => {
  const onClose = mock.fn();
  renderSettingsModal({ onClose: onClose as never });
  fireEvent.click(screen.getByTestId('settings-close-button'));
  fireEvent.keyDown(document, { key: 'Escape' });
  assert.equal(onClose.mock.callCount(), 2);
});

test('US3: mismatched password confirmation is rejected before calling updateUser', async () => {
  const { auth } = renderSettingsModal({});

  fireEvent.change(screen.getByTestId(TEST_IDS.SETTINGS_NEW_PASSWORD_INPUT), { target: { value: 'NewPassword1!' } });
  fireEvent.change(screen.getByTestId(TEST_IDS.SETTINGS_CONFIRM_PASSWORD_INPUT), { target: { value: 'different1' } });
  fireEvent.click(screen.getByTestId(TEST_IDS.SETTINGS_PASSWORD_SAVE_BUTTON));

  await waitFor(() => {
    assert.ok(screen.getByTestId(TEST_IDS.SETTINGS_PASSWORD_ERROR));
  });
  assert.equal(auth.updateUser.mock.callCount(), 0);
});

test('US3: a matching password confirmation calls updateUser with the new password', async () => {
  const { auth } = renderSettingsModal({});

  fireEvent.change(screen.getByTestId(TEST_IDS.SETTINGS_NEW_PASSWORD_INPUT), { target: { value: 'NewPassword1!' } });
  fireEvent.change(screen.getByTestId(TEST_IDS.SETTINGS_CONFIRM_PASSWORD_INPUT), { target: { value: 'NewPassword1!' } });
  fireEvent.click(screen.getByTestId(TEST_IDS.SETTINGS_PASSWORD_SAVE_BUTTON));

  await waitFor(() => {
    assert.ok(screen.getByTestId(TEST_IDS.SETTINGS_PASSWORD_SUCCESS));
  });
  assert.deepEqual(auth.updateUser.mock.calls[0]?.arguments[0], { password: 'NewPassword1!' });
});

test('US5: confirming the delete-account modal shows the exact required copy, calls deleteAccount, signs out, and redirects', async () => {
  const { auth, deleteAccount } = renderSettingsModal({});

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
  const { deleteAccount } = renderSettingsModal({});

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
  renderSettingsModal({ deleteAccount: deleteAccount as never });

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
  renderSettingsModal({ deleteAccount: deleteAccount as never });

  fireEvent.click(screen.getByTestId(TEST_IDS.SETTINGS_DELETE_ACCOUNT_BUTTON));
  fireEvent.click(screen.getByTestId(TEST_IDS.DELETE_ACCOUNT_CONFIRM_BUTTON));

  await waitFor(() => {
    assert.ok(screen.getByTestId(TEST_IDS.SETTINGS_DELETE_ACCOUNT_ERROR));
  });
  assert.ok(screen.getByTestId(TEST_IDS.DELETE_ACCOUNT_MODAL), 'the modal must stay open on failure, not auto-close');

  const confirmButton = screen.getByTestId(TEST_IDS.DELETE_ACCOUNT_CONFIRM_BUTTON) as HTMLButtonElement;
  assert.equal(confirmButton.disabled, false, 're-enabled after failure so the user can retry');
});

test('change password: the section is titled "Change password" and the fields use the signup form\'s eye toggle', () => {
  renderSettingsModal({});
  assert.ok(screen.getByText('Change password'));

  const input = screen.getByTestId(TEST_IDS.SETTINGS_NEW_PASSWORD_INPUT) as HTMLInputElement;
  assert.equal(input.type, 'password');
  assert.equal(screen.queryByTestId('settings-new-password-input-toggle'), null, 'no eye until something is typed');

  fireEvent.change(input, { target: { value: 'abc' } });
  fireEvent.click(screen.getByTestId('settings-new-password-input-toggle'));
  assert.equal(input.type, 'text');
  fireEvent.click(screen.getByTestId('settings-new-password-input-toggle'));
  assert.equal(input.type, 'password');
});

test('change password: a policy failure shows the requirements tooltip on the new-password field, a mismatch on the confirm field', async () => {
  const { auth } = renderSettingsModal({});

  fireEvent.change(screen.getByTestId(TEST_IDS.SETTINGS_NEW_PASSWORD_INPUT), { target: { value: 'weak' } });
  fireEvent.click(screen.getByTestId(TEST_IDS.SETTINGS_PASSWORD_SAVE_BUTTON));
  const policyTooltip = await screen.findByTestId(TEST_IDS.SETTINGS_PASSWORD_ERROR);
  assert.match(policyTooltip.textContent ?? '', /Password must:/);
  assert.equal(policyTooltip.closest('.login-field')?.querySelector('[data-testid="settings-new-password-input"]') !== null, true);

  fireEvent.change(screen.getByTestId(TEST_IDS.SETTINGS_NEW_PASSWORD_INPUT), { target: { value: 'NewPassword1!' } });
  assert.equal(screen.queryByTestId(TEST_IDS.SETTINGS_PASSWORD_ERROR), null, 'typing clears the tooltip');

  fireEvent.change(screen.getByTestId(TEST_IDS.SETTINGS_CONFIRM_PASSWORD_INPUT), { target: { value: 'Different1!' } });
  fireEvent.click(screen.getByTestId(TEST_IDS.SETTINGS_PASSWORD_SAVE_BUTTON));
  const mismatchTooltip = await screen.findByTestId(TEST_IDS.SETTINGS_PASSWORD_ERROR);
  assert.equal(mismatchTooltip.textContent, 'Passwords do not match');
  assert.equal(mismatchTooltip.closest('.login-field')?.querySelector('[data-testid="settings-confirm-password-input"]') !== null, true);
  assert.equal(auth.updateUser.mock.callCount(), 0);
});
