import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { setupJsdom } from './setup/jsdom';
import { TEST_IDS } from './consts/inkSpace';

setupJsdom();

const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { MemoryRouter, Routes, Route } = await import('react-router-dom');
const { default: VerifyEmailPage } = await import('../src/routes/VerifyEmailPage');

afterEach(() => {
  cleanup();
});

function renderVerifyEmailPage(auth: { resend: ReturnType<typeof mock.fn> }, location: { hash?: string; search?: string } = {}) {
  return render(
    <MemoryRouter initialEntries={['/verify-email']}>
      <Routes>
        <Route
          path="/verify-email"
          element={
            <VerifyEmailPage auth={auth as never} locationHash={location.hash ?? ''} locationSearch={location.search ?? ''} />
          }
        />
        <Route path="/workspace" element={<div data-testid="workspace-landed" />} />
      </Routes>
    </MemoryRouter>,
  );
}

test('EV1: a successful verification callback (no link error params) shows the verified notice', () => {
  const resend = mock.fn(async () => ({ data: {}, error: null }));
  renderVerifyEmailPage({ resend });

  assert.ok(screen.getByTestId(TEST_IDS.VERIFY_EMAIL_SUCCESS));
  assert.ok(screen.getByTestId(TEST_IDS.VERIFY_EMAIL_WORKSPACE_LINK));
});

test('EV3: an expired/used verification link shows an inline error and the resend form instead of the success notice', () => {
  const resend = mock.fn(async () => ({ data: {}, error: null }));
  renderVerifyEmailPage(
    { resend },
    { hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired' },
  );

  assert.equal(screen.getByTestId(TEST_IDS.VERIFY_EMAIL_LINK_ERROR).textContent, 'Email link is invalid or has expired');
  assert.equal(screen.queryByTestId(TEST_IDS.VERIFY_EMAIL_SUCCESS), null);
  assert.ok(screen.getByTestId(TEST_IDS.VERIFY_EMAIL_RESEND_FORM));
});

test('EV3: an expired/used verification link communicated via the query string (not the hash) is also recognized', () => {
  const resend = mock.fn(async () => ({ data: {}, error: null }));
  renderVerifyEmailPage(
    { resend },
    { search: '?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired' },
  );

  assert.equal(screen.getByTestId(TEST_IDS.VERIFY_EMAIL_LINK_ERROR).textContent, 'Email link is invalid or has expired');
  assert.equal(screen.queryByTestId(TEST_IDS.VERIFY_EMAIL_SUCCESS), null);
});

test('EV3: shows an inline error and never calls resend when the email is empty', () => {
  const resend = mock.fn(async () => ({ data: {}, error: null }));
  renderVerifyEmailPage({ resend }, { hash: '#error=access_denied&error_code=otp_expired' });

  fireEvent.submit(screen.getByTestId(TEST_IDS.VERIFY_EMAIL_RESEND_FORM));

  assert.ok(screen.getByTestId(TEST_IDS.VERIFY_EMAIL_ERROR));
  assert.equal(resend.mock.callCount(), 0);
});

test('EV3: submitting the resend form calls resend with type "signup" and shows confirmation', async () => {
  const resend = mock.fn(async (_params: { type: string; email: string }) => ({ data: {}, error: null }));
  renderVerifyEmailPage({ resend }, { hash: '#error=access_denied&error_code=otp_expired' });

  fireEvent.change(screen.getByTestId(TEST_IDS.VERIFY_EMAIL_EMAIL_INPUT), { target: { value: 'user@example.com' } });
  fireEvent.submit(screen.getByTestId(TEST_IDS.VERIFY_EMAIL_RESEND_FORM));

  await waitFor(() => {
    assert.ok(screen.getByTestId(TEST_IDS.VERIFY_EMAIL_RESENT));
  });
  assert.equal(resend.mock.callCount(), 1);
  assert.deepEqual(resend.mock.calls[0]?.arguments[0], { type: 'signup', email: 'user@example.com' });
});

test('design req 3.3 (no silent failures): a resend error is surfaced inline, not swallowed', async () => {
  const resend = mock.fn(async () => ({ data: {}, error: { message: 'Unable to resend verification email' } }));
  renderVerifyEmailPage({ resend }, { hash: '#error=access_denied&error_code=otp_expired' });

  fireEvent.change(screen.getByTestId(TEST_IDS.VERIFY_EMAIL_EMAIL_INPUT), { target: { value: 'user@example.com' } });
  fireEvent.submit(screen.getByTestId(TEST_IDS.VERIFY_EMAIL_RESEND_FORM));

  await waitFor(() => {
    assert.equal(screen.getByTestId(TEST_IDS.VERIFY_EMAIL_ERROR).textContent, 'Unable to resend verification email');
  });
});
