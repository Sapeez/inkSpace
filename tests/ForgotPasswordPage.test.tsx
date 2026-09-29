import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { setupJsdom } from './setup/jsdom';
import { TEST_IDS } from './consts/inkSpace';

setupJsdom();

const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { MemoryRouter, Routes, Route } = await import('react-router-dom');
const { default: ForgotPasswordPage } = await import('../src/routes/ForgotPasswordPage');

afterEach(() => {
  cleanup();
});

function renderForgotPasswordPage(auth: { resetPasswordForEmail: ReturnType<typeof mock.fn> }) {
  return render(
    <MemoryRouter initialEntries={['/forgot-password']}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPasswordPage auth={auth as never} />} />
        <Route path="/login" element={<div data-testid="login-landed" />} />
      </Routes>
    </MemoryRouter>,
  );
}

test('PR1: shows an inline error and never calls resetPasswordForEmail when the email is empty', async () => {
  const resetPasswordForEmail = mock.fn(async () => ({ data: {}, error: null }));
  renderForgotPasswordPage({ resetPasswordForEmail });

  fireEvent.submit(screen.getByTestId(TEST_IDS.FORGOT_PASSWORD_FORM));

  assert.ok(screen.getByTestId(TEST_IDS.FORGOT_PASSWORD_ERROR));
  assert.equal(resetPasswordForEmail.mock.callCount(), 0);
});

test('PR1: a submitted email triggers resetPasswordForEmail and shows the check-your-email notice', async () => {
  const resetPasswordForEmail = mock.fn(async (_email: string) => ({ data: {}, error: null }));
  renderForgotPasswordPage({ resetPasswordForEmail });

  fireEvent.change(screen.getByTestId(TEST_IDS.FORGOT_PASSWORD_EMAIL_INPUT), {
    target: { value: 'user@example.com' },
  });
  fireEvent.submit(screen.getByTestId(TEST_IDS.FORGOT_PASSWORD_FORM));

  await waitFor(() => {
    assert.ok(screen.getByTestId(TEST_IDS.FORGOT_PASSWORD_INFO));
  });
  assert.equal(resetPasswordForEmail.mock.callCount(), 1);
  assert.equal(resetPasswordForEmail.mock.calls[0]?.arguments[0], 'user@example.com');
});

// PR1/PR2 wiring: a typo'd or missing redirect path would pass every other
// test here while silently breaking the reset flow in production, since
// nothing else in this test suite touches the emailed link's destination.
test('PR1/PR2: resetPasswordForEmail is called with redirectTo pointing at /reset-password', async () => {
  const resetPasswordForEmail = mock.fn(async (_email: string, _options?: { redirectTo?: string }) => ({
    data: {},
    error: null,
  }));
  renderForgotPasswordPage({ resetPasswordForEmail });

  fireEvent.change(screen.getByTestId(TEST_IDS.FORGOT_PASSWORD_EMAIL_INPUT), {
    target: { value: 'user@example.com' },
  });
  fireEvent.submit(screen.getByTestId(TEST_IDS.FORGOT_PASSWORD_FORM));

  await waitFor(() => {
    assert.equal(resetPasswordForEmail.mock.callCount(), 1);
  });
  const redirectTo = resetPasswordForEmail.mock.calls[0]?.arguments[1]?.redirectTo;
  assert.ok(redirectTo?.endsWith('/reset-password'), `expected redirectTo to end with /reset-password, got ${redirectTo}`);
});

// Security: the success notice must not reveal whether an account exists for
// the submitted email — same wording either way.
test('PR1: the confirmation notice does not distinguish an unknown email from a known one', async () => {
  const resetPasswordForEmail = mock.fn(async () => ({ data: {}, error: null }));
  renderForgotPasswordPage({ resetPasswordForEmail });

  fireEvent.change(screen.getByTestId(TEST_IDS.FORGOT_PASSWORD_EMAIL_INPUT), {
    target: { value: 'unknown@example.com' },
  });
  fireEvent.submit(screen.getByTestId(TEST_IDS.FORGOT_PASSWORD_FORM));

  await waitFor(() => {
    assert.match(screen.getByTestId(TEST_IDS.FORGOT_PASSWORD_INFO).textContent ?? '', /if an account exists/i);
  });
});

test('design req 3.3 (no silent failures): a resetPasswordForEmail error is surfaced inline, not swallowed', async () => {
  const resetPasswordForEmail = mock.fn(async () => ({
    data: {},
    error: { message: 'Unable to send reset email' },
  }));
  renderForgotPasswordPage({ resetPasswordForEmail });

  fireEvent.change(screen.getByTestId(TEST_IDS.FORGOT_PASSWORD_EMAIL_INPUT), {
    target: { value: 'user@example.com' },
  });
  fireEvent.submit(screen.getByTestId(TEST_IDS.FORGOT_PASSWORD_FORM));

  await waitFor(() => {
    assert.equal(screen.getByTestId(TEST_IDS.FORGOT_PASSWORD_ERROR).textContent, 'Unable to send reset email');
  });
});
