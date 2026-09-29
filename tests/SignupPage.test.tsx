import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { setupJsdom } from './setup/jsdom';
import { TEST_IDS } from './consts/inkSpace';

setupJsdom();

const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { MemoryRouter, Routes, Route } = await import('react-router-dom');
const { default: SignupPage } = await import('../src/routes/SignupPage');

afterEach(() => {
  cleanup();
});

function renderSignupPage(auth: { signUp: ReturnType<typeof mock.fn> }) {
  return render(
    <MemoryRouter initialEntries={['/signup']}>
      <Routes>
        <Route path="/signup" element={<SignupPage auth={auth as never} />} />
        <Route path="/workspace" element={<div data-testid="workspace-landed" />} />
      </Routes>
    </MemoryRouter>,
  );
}

test('SU1: shows an inline error and never calls signUp when the password is too short', async () => {
  const signUp = mock.fn(async () => ({ data: { user: null, session: null }, error: null }));
  renderSignupPage({ signUp });

  fireEvent.change(screen.getByTestId(TEST_IDS.SIGNUP_EMAIL_INPUT), { target: { value: 'new@example.com' } });
  fireEvent.change(screen.getByTestId(TEST_IDS.SIGNUP_PASSWORD_INPUT), { target: { value: '123' } });
  fireEvent.submit(screen.getByTestId(TEST_IDS.SIGNUP_FORM));

  assert.ok(screen.getByTestId(TEST_IDS.SIGNUP_ERROR));
  assert.equal(signUp.mock.callCount(), 0);
});

test('SU1/SU3: a successful signup with an immediate session lands on the workspace', async () => {
  const signUp = mock.fn(async (_credentials: { email: string; password: string }) => ({
    data: { user: { id: 'user-1' }, session: { access_token: 'token' } },
    error: null,
  }));
  renderSignupPage({ signUp });

  fireEvent.change(screen.getByTestId(TEST_IDS.SIGNUP_EMAIL_INPUT), { target: { value: 'new@example.com' } });
  fireEvent.change(screen.getByTestId(TEST_IDS.SIGNUP_PASSWORD_INPUT), { target: { value: 'password123' } });
  fireEvent.submit(screen.getByTestId(TEST_IDS.SIGNUP_FORM));

  await waitFor(() => {
    assert.ok(screen.getByTestId('workspace-landed'));
  });
  assert.equal(signUp.mock.callCount(), 1);
  assert.deepEqual(signUp.mock.calls[0]?.arguments[0], { email: 'new@example.com', password: 'password123' });
});

// EV1: when the project requires email confirmation, `signUp` succeeds but
// returns no session — this isn't a failure, so it must not show the error
// path, and there's no session yet to navigate to /workspace with.
test('EV1: a successful signup with no session (confirmation required) shows the check-your-email notice, not an error', async () => {
  const signUp = mock.fn(async () => ({ data: { user: { id: 'user-1' }, session: null }, error: null }));
  renderSignupPage({ signUp });

  fireEvent.change(screen.getByTestId(TEST_IDS.SIGNUP_EMAIL_INPUT), { target: { value: 'new@example.com' } });
  fireEvent.change(screen.getByTestId(TEST_IDS.SIGNUP_PASSWORD_INPUT), { target: { value: 'password123' } });
  fireEvent.submit(screen.getByTestId(TEST_IDS.SIGNUP_FORM));

  await waitFor(() => {
    assert.ok(screen.getByTestId(TEST_IDS.SIGNUP_INFO));
  });
  assert.equal(screen.queryByTestId(TEST_IDS.SIGNUP_ERROR), null);
});

test('design req 3.3 (no silent failures): a signUp error is surfaced inline, not swallowed', async () => {
  const signUp = mock.fn(async () => ({
    data: { user: null, session: null },
    error: { message: 'User already registered' },
  }));
  renderSignupPage({ signUp });

  fireEvent.change(screen.getByTestId(TEST_IDS.SIGNUP_EMAIL_INPUT), { target: { value: 'taken@example.com' } });
  fireEvent.change(screen.getByTestId(TEST_IDS.SIGNUP_PASSWORD_INPUT), { target: { value: 'password123' } });
  fireEvent.submit(screen.getByTestId(TEST_IDS.SIGNUP_FORM));

  await waitFor(() => {
    assert.equal(screen.getByTestId(TEST_IDS.SIGNUP_ERROR).textContent, 'User already registered');
  });
});
