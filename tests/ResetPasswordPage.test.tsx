import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { setupJsdom } from './setup/jsdom';
import { TEST_IDS } from './consts/inkSpace';

setupJsdom();

const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { MemoryRouter, Routes, Route } = await import('react-router-dom');
const { default: ResetPasswordPage } = await import('../src/routes/ResetPasswordPage');

afterEach(() => {
  cleanup();
});

function renderResetPasswordPage(
  auth: { updateUser: ReturnType<typeof mock.fn> },
  location: { hash?: string; search?: string } = {},
) {
  return render(
    <MemoryRouter initialEntries={['/reset-password']}>
      <Routes>
        <Route
          path="/reset-password"
          element={
            <ResetPasswordPage
              auth={auth as never}
              locationHash={location.hash ?? ''}
              locationSearch={location.search ?? ''}
            />
          }
        />
        <Route path="/forgot-password" element={<div data-testid="forgot-password-landed" />} />
        <Route path="/login" element={<div data-testid="login-landed" />} />
      </Routes>
    </MemoryRouter>,
  );
}

test('PR2: an expired/used reset link shows an inline error and a link to request a new one, without rendering the form', async () => {
  const updateUser = mock.fn(async () => ({ data: {}, error: null }));
  renderResetPasswordPage(
    { updateUser },
    { hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired' },
  );

  assert.equal(screen.getByTestId(TEST_IDS.RESET_PASSWORD_LINK_ERROR).textContent, 'Email link is invalid or has expired');
  assert.equal(screen.queryByTestId(TEST_IDS.RESET_PASSWORD_FORM), null);
  assert.ok(screen.getByTestId(TEST_IDS.RESET_PASSWORD_RETRY_LINK));
});

test('PR2: an expired/used reset link communicated via the query string (not the hash) is also recognized', () => {
  const updateUser = mock.fn(async () => ({ data: {}, error: null }));
  renderResetPasswordPage(
    { updateUser },
    { search: '?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired' },
  );

  assert.equal(screen.getByTestId(TEST_IDS.RESET_PASSWORD_LINK_ERROR).textContent, 'Email link is invalid or has expired');
  assert.equal(screen.queryByTestId(TEST_IDS.RESET_PASSWORD_FORM), null);
});

test('a valid recovery session (no link error params) renders the new-password form', () => {
  const updateUser = mock.fn(async () => ({ data: {}, error: null }));
  renderResetPasswordPage({ updateUser });

  assert.ok(screen.getByTestId(TEST_IDS.RESET_PASSWORD_FORM));
});

test('shows an inline error and never calls updateUser when the new password is too short', async () => {
  const updateUser = mock.fn(async () => ({ data: {}, error: null }));
  renderResetPasswordPage({ updateUser });

  fireEvent.change(screen.getByTestId(TEST_IDS.RESET_PASSWORD_PASSWORD_INPUT), { target: { value: '123' } });
  fireEvent.change(screen.getByTestId(TEST_IDS.RESET_PASSWORD_CONFIRM_INPUT), { target: { value: '123' } });
  fireEvent.submit(screen.getByTestId(TEST_IDS.RESET_PASSWORD_FORM));

  assert.ok(screen.getByTestId(TEST_IDS.RESET_PASSWORD_ERROR));
  assert.equal(updateUser.mock.callCount(), 0);
});

test('shows an inline error and never calls updateUser when the passwords do not match', async () => {
  const updateUser = mock.fn(async () => ({ data: {}, error: null }));
  renderResetPasswordPage({ updateUser });

  fireEvent.change(screen.getByTestId(TEST_IDS.RESET_PASSWORD_PASSWORD_INPUT), { target: { value: 'password123' } });
  fireEvent.change(screen.getByTestId(TEST_IDS.RESET_PASSWORD_CONFIRM_INPUT), { target: { value: 'password456' } });
  fireEvent.submit(screen.getByTestId(TEST_IDS.RESET_PASSWORD_FORM));

  assert.equal(screen.getByTestId(TEST_IDS.RESET_PASSWORD_ERROR).textContent, 'Passwords do not match');
  assert.equal(updateUser.mock.callCount(), 0);
});

test('PR3: a successful update calls updateUser with the new password and shows the success notice', async () => {
  const updateUser = mock.fn(async (_attrs: { password: string }) => ({ data: {}, error: null }));
  renderResetPasswordPage({ updateUser });

  fireEvent.change(screen.getByTestId(TEST_IDS.RESET_PASSWORD_PASSWORD_INPUT), { target: { value: 'newpassword123' } });
  fireEvent.change(screen.getByTestId(TEST_IDS.RESET_PASSWORD_CONFIRM_INPUT), { target: { value: 'newpassword123' } });
  fireEvent.submit(screen.getByTestId(TEST_IDS.RESET_PASSWORD_FORM));

  await waitFor(() => {
    assert.ok(screen.getByTestId(TEST_IDS.RESET_PASSWORD_SUCCESS));
  });
  assert.equal(updateUser.mock.callCount(), 1);
  assert.deepEqual(updateUser.mock.calls[0]?.arguments[0], { password: 'newpassword123' });
});

test('design req 3.3 (no silent failures): an updateUser error is surfaced inline, not swallowed', async () => {
  const updateUser = mock.fn(async () => ({ data: {}, error: { message: 'Auth session missing' } }));
  renderResetPasswordPage({ updateUser });

  fireEvent.change(screen.getByTestId(TEST_IDS.RESET_PASSWORD_PASSWORD_INPUT), { target: { value: 'newpassword123' } });
  fireEvent.change(screen.getByTestId(TEST_IDS.RESET_PASSWORD_CONFIRM_INPUT), { target: { value: 'newpassword123' } });
  fireEvent.submit(screen.getByTestId(TEST_IDS.RESET_PASSWORD_FORM));

  await waitFor(() => {
    assert.equal(screen.getByTestId(TEST_IDS.RESET_PASSWORD_ERROR).textContent, 'Auth session missing');
  });
});
