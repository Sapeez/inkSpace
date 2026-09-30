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
        <Route path="/login" element={<div data-testid="login-landed" />} />
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
  fireEvent.change(screen.getByTestId(TEST_IDS.SIGNUP_PASSWORD_INPUT), { target: { value: 'Password123!' } });
  fireEvent.submit(screen.getByTestId(TEST_IDS.SIGNUP_FORM));

  await waitFor(() => {
    assert.ok(screen.getByTestId('workspace-landed'));
  });
  assert.equal(signUp.mock.callCount(), 1);
  const args = signUp.mock.calls[0]?.arguments[0] as { email: string; password: string; options?: { emailRedirectTo?: string } };
  assert.equal(args.email, 'new@example.com');
  assert.equal(args.password, 'Password123!');
  // The confirmation mail's link must land on /verify-email in this app.
  assert.match(args.options?.emailRedirectTo ?? '', /\/verify-email$/);
});

// EV1: when the project requires email confirmation, `signUp` succeeds but
// returns no session — this isn't a failure, so it must not show the error
// path, and there's no session yet to navigate to /workspace with.
test('EV1: a successful signup with no session (confirmation required) shows the check-your-email notice, not an error', async () => {
  const signUp = mock.fn(async () => ({ data: { user: { id: 'user-1' }, session: null }, error: null }));
  renderSignupPage({ signUp });

  fireEvent.change(screen.getByTestId(TEST_IDS.SIGNUP_EMAIL_INPUT), { target: { value: 'new@example.com' } });
  fireEvent.change(screen.getByTestId(TEST_IDS.SIGNUP_PASSWORD_INPUT), { target: { value: 'Password123!' } });
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
  fireEvent.change(screen.getByTestId(TEST_IDS.SIGNUP_PASSWORD_INPUT), { target: { value: 'Password123!' } });
  fireEvent.submit(screen.getByTestId(TEST_IDS.SIGNUP_FORM));

  await waitFor(() => {
    assert.equal(screen.getByTestId(TEST_IDS.SIGNUP_ERROR).textContent, 'User already registered');
  });
});

test('an already-registered email (user returned with empty identities) shows an inline error, not the check-your-email card', async () => {
  const signUp = mock.fn(async () => ({
    data: { user: { id: 'user-1', identities: [] }, session: null },
    error: null,
  }));
  renderSignupPage({ signUp });

  fireEvent.change(screen.getByTestId(TEST_IDS.SIGNUP_EMAIL_INPUT), { target: { value: 'taken@example.com' } });
  fireEvent.change(screen.getByTestId(TEST_IDS.SIGNUP_PASSWORD_INPUT), { target: { value: 'Password123!' } });
  fireEvent.submit(screen.getByTestId(TEST_IDS.SIGNUP_FORM));

  await waitFor(() => {
    assert.ok(screen.getByTestId(TEST_IDS.SIGNUP_ERROR));
  });
  assert.equal(screen.queryByTestId(TEST_IDS.SIGNUP_INFO), null);
});

test('the eye button toggles password visibility on the signup form', () => {
  const signUp = mock.fn(async () => ({ data: { user: null, session: null }, error: null }));
  renderSignupPage({ signUp });

  const input = screen.getByTestId(TEST_IDS.SIGNUP_PASSWORD_INPUT) as HTMLInputElement;
  assert.equal(screen.queryByTestId(`${TEST_IDS.SIGNUP_PASSWORD_INPUT}-toggle`), null);
  fireEvent.change(input, { target: { value: 'secret' } });
  const toggle = screen.getByTestId(`${TEST_IDS.SIGNUP_PASSWORD_INPUT}-toggle`);
  assert.equal(input.type, 'password');
  fireEvent.click(toggle);
  assert.equal(input.type, 'text');
  fireEvent.click(toggle);
  assert.equal(input.type, 'password');
});

test('signup rejects a password missing required character classes without calling signUp', () => {
  const signUp = mock.fn(async () => ({ data: { user: null, session: null }, error: null }));
  renderSignupPage({ signUp });

  fireEvent.change(screen.getByTestId(TEST_IDS.SIGNUP_EMAIL_INPUT), { target: { value: 'new@example.com' } });
  fireEvent.change(screen.getByTestId(TEST_IDS.SIGNUP_PASSWORD_INPUT), { target: { value: 'password123' } });
  fireEvent.submit(screen.getByTestId(TEST_IDS.SIGNUP_FORM));

  assert.match(screen.getByTestId(TEST_IDS.SIGNUP_ERROR).textContent ?? '', /uppercase/);
  assert.equal(signUp.mock.callCount(), 0);
});

test('an invalid email shows the email validation message without calling signUp', () => {
  const signUp = mock.fn(async () => ({ data: { user: null, session: null }, error: null }));
  renderSignupPage({ signUp });

  fireEvent.change(screen.getByTestId(TEST_IDS.SIGNUP_EMAIL_INPUT), { target: { value: 'nope' } });
  fireEvent.change(screen.getByTestId(TEST_IDS.SIGNUP_PASSWORD_INPUT), { target: { value: 'Password123!' } });
  fireEvent.submit(screen.getByTestId(TEST_IDS.SIGNUP_FORM));

  assert.match(screen.getByTestId(TEST_IDS.SIGNUP_ERROR).textContent ?? '', /'@'/);
  assert.equal(signUp.mock.callCount(), 0);
});

test('a password over 20 characters is rejected without calling signUp, and editing clears the tooltip', () => {
  const signUp = mock.fn(async () => ({ data: { user: null, session: null }, error: null }));
  renderSignupPage({ signUp });

  fireEvent.change(screen.getByTestId(TEST_IDS.SIGNUP_EMAIL_INPUT), { target: { value: 'new@example.com' } });
  fireEvent.change(screen.getByTestId(TEST_IDS.SIGNUP_PASSWORD_INPUT), { target: { value: 'Aa1!aaaaaaaaaaaaaaaaa' } });
  fireEvent.submit(screen.getByTestId(TEST_IDS.SIGNUP_FORM));
  assert.match(screen.getByTestId(TEST_IDS.SIGNUP_ERROR).textContent ?? '', /8-20 characters/);
  assert.equal(signUp.mock.callCount(), 0);

  fireEvent.change(screen.getByTestId(TEST_IDS.SIGNUP_PASSWORD_INPUT), { target: { value: 'Password123!' } });
  assert.equal(screen.queryByTestId(TEST_IDS.SIGNUP_ERROR), null);
});

test('the "Log in" footer link navigates to /login', () => {
  renderSignupPage({ signUp: mock.fn(async () => ({ data: {}, error: null })) });
  fireEvent.click(screen.getByTestId(TEST_IDS.SIGNUP_LOGIN_LINK));
  assert.ok(screen.getByTestId('login-landed'));
});

test('the check-your-email card names the address and its "Back to login" button navigates to /login', async () => {
  const signUp = mock.fn(async () => ({ data: { user: { id: 'user-1' }, session: null }, error: null }));
  renderSignupPage({ signUp });

  fireEvent.change(screen.getByTestId(TEST_IDS.SIGNUP_EMAIL_INPUT), { target: { value: 'new@example.com' } });
  fireEvent.change(screen.getByTestId(TEST_IDS.SIGNUP_PASSWORD_INPUT), { target: { value: 'Password123!' } });
  fireEvent.submit(screen.getByTestId(TEST_IDS.SIGNUP_FORM));

  await waitFor(() => {
    assert.match(screen.getByTestId(TEST_IDS.SIGNUP_INFO).textContent ?? '', /new@example\.com/);
  });
  fireEvent.click(screen.getByTestId(TEST_IDS.SIGNUP_LOGIN_LINK));
  assert.ok(screen.getByTestId('login-landed'));
});
