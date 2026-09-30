import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { setupJsdom } from './setup/jsdom';
import { TEST_IDS } from './consts/inkSpace';

setupJsdom();

const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { MemoryRouter, Routes, Route } = await import('react-router-dom');
const { default: LoginPage } = await import('../src/routes/LoginPage');

const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function mockLoginAttemptAllowed() {
  globalThis.fetch = (async () => ({ ok: true, status: 204, json: async () => ({}) })) as unknown as typeof fetch;
}

function renderLoginPage(auth: { signInWithPassword: ReturnType<typeof mock.fn> }) {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage auth={auth as never} />} />
        <Route path="/workspace" element={<div data-testid="workspace-landed" />} />
      </Routes>
    </MemoryRouter>,
  );
}

test('LG1: shows an inline error and never calls signInWithPassword or the rate-limit check when a field is empty', async () => {
  globalThis.fetch = (async () => {
    throw new Error('fetch should not be called when client-side validation fails');
  }) as typeof fetch;
  const signInWithPassword = mock.fn(async () => ({ data: { session: null }, error: null }));
  renderLoginPage({ signInWithPassword });

  fireEvent.change(screen.getByTestId(TEST_IDS.LOGIN_EMAIL_INPUT), { target: { value: 'user@example.com' } });
  fireEvent.submit(screen.getByTestId(TEST_IDS.LOGIN_FORM));

  assert.ok(screen.getByTestId(TEST_IDS.LOGIN_ERROR));
  assert.equal(signInWithPassword.mock.callCount(), 0);
});

test('LG1: a successful login lands on the workspace', async () => {
  mockLoginAttemptAllowed();
  const signInWithPassword = mock.fn(async () => ({ data: { session: { access_token: 'token' } }, error: null }));
  renderLoginPage({ signInWithPassword });

  fireEvent.change(screen.getByTestId(TEST_IDS.LOGIN_EMAIL_INPUT), { target: { value: 'user@example.com' } });
  fireEvent.change(screen.getByTestId(TEST_IDS.LOGIN_PASSWORD_INPUT), { target: { value: 'password123' } });
  fireEvent.submit(screen.getByTestId(TEST_IDS.LOGIN_FORM));

  await waitFor(() => {
    assert.ok(screen.getByTestId('workspace-landed'));
  });
  assert.equal(signInWithPassword.mock.callCount(), 1);
});

test('design req 3.3 (no silent failures): invalid credentials are surfaced inline, not swallowed', async () => {
  mockLoginAttemptAllowed();
  const signInWithPassword = mock.fn(async () => ({
    data: { session: null },
    error: { message: 'Invalid login credentials' },
  }));
  renderLoginPage({ signInWithPassword });

  fireEvent.change(screen.getByTestId(TEST_IDS.LOGIN_EMAIL_INPUT), { target: { value: 'user@example.com' } });
  fireEvent.change(screen.getByTestId(TEST_IDS.LOGIN_PASSWORD_INPUT), { target: { value: 'wrong-password' } });
  fireEvent.submit(screen.getByTestId(TEST_IDS.LOGIN_FORM));

  await waitFor(() => {
    assert.equal(screen.getByTestId(TEST_IDS.LOGIN_ERROR).textContent, 'Invalid login credentials');
  });
});

test('LG5: a rate-limited attempt is blocked before ever calling signInWithPassword', async () => {
  globalThis.fetch = (async () =>
    jsonResponse({ message: 'Too many login attempts. Please try again later.', retryAfterSeconds: 60 }, 429)) as typeof fetch;
  const signInWithPassword = mock.fn(async () => ({ data: { session: { access_token: 'token' } }, error: null }));
  renderLoginPage({ signInWithPassword });

  fireEvent.change(screen.getByTestId(TEST_IDS.LOGIN_EMAIL_INPUT), { target: { value: 'user@example.com' } });
  fireEvent.change(screen.getByTestId(TEST_IDS.LOGIN_PASSWORD_INPUT), { target: { value: 'password123' } });
  fireEvent.submit(screen.getByTestId(TEST_IDS.LOGIN_FORM));

  await waitFor(() => {
    assert.equal(screen.getByTestId(TEST_IDS.LOGIN_ERROR).textContent, 'Too many login attempts. Please try again later.');
  });
  assert.equal(signInWithPassword.mock.callCount(), 0);
});

// Found in code review: `checkLoginRateLimit` throws on a non-2xx/non-429
// response (e.g. the API being briefly down) — without a `catch` around it,
// that exception silently reverted the submit button with no error message
// at all, which is exactly the "no silent failures" requirement this test
// suite otherwise enforces.
test("design req 3.3 (no silent failures): a broken rate-limit check surfaces inline instead of failing silently", async () => {
  globalThis.fetch = (async () => ({ ok: false, status: 500, json: async () => ({}) })) as unknown as typeof fetch;
  const signInWithPassword = mock.fn(async () => ({ data: { session: { access_token: 'token' } }, error: null }));
  renderLoginPage({ signInWithPassword });

  fireEvent.change(screen.getByTestId(TEST_IDS.LOGIN_EMAIL_INPUT), { target: { value: 'user@example.com' } });
  fireEvent.change(screen.getByTestId(TEST_IDS.LOGIN_PASSWORD_INPUT), { target: { value: 'password123' } });
  fireEvent.submit(screen.getByTestId(TEST_IDS.LOGIN_FORM));

  await waitFor(() => {
    assert.ok(screen.getByTestId(TEST_IDS.LOGIN_ERROR).textContent);
  });
  assert.equal(signInWithPassword.mock.callCount(), 0);
});

test('the eye button toggles password visibility on the login form', async () => {
  const { MemoryRouter } = await import('react-router-dom');
  const { default: LoginPage } = await import('../src/routes/LoginPage');
  const signInWithPassword = mock.fn(async () => ({ data: {}, error: null }));
  render(
    <MemoryRouter>
      <LoginPage auth={{ signInWithPassword } as never} />
    </MemoryRouter>,
  );

  const input = screen.getByTestId('login-password-input') as HTMLInputElement;
  assert.equal(screen.queryByTestId('login-password-input-toggle'), null);
  fireEvent.change(input, { target: { value: 'secret' } });
  const toggle = screen.getByTestId('login-password-input-toggle');
  assert.equal(input.type, 'password');
  fireEvent.click(toggle);
  assert.equal(input.type, 'text');
  fireEvent.click(toggle);
  assert.equal(input.type, 'password');
});

test('an invalid email shows the email validation message and skips the rate-limit check and signInWithPassword', () => {
  globalThis.fetch = (async () => {
    throw new Error('fetch should not be called when client-side validation fails');
  }) as typeof fetch;
  const signInWithPassword = mock.fn(async () => ({ data: { session: null }, error: null }));
  renderLoginPage({ signInWithPassword });

  fireEvent.change(screen.getByTestId(TEST_IDS.LOGIN_EMAIL_INPUT), { target: { value: 'not-an-email' } });
  fireEvent.change(screen.getByTestId(TEST_IDS.LOGIN_PASSWORD_INPUT), { target: { value: 'password123' } });
  fireEvent.submit(screen.getByTestId(TEST_IDS.LOGIN_FORM));

  assert.match(screen.getByTestId(TEST_IDS.LOGIN_ERROR).textContent ?? '', /'@'/);
  assert.equal(signInWithPassword.mock.callCount(), 0);
});

test('a missing password shows "Password is required", and editing a field clears the tooltip', () => {
  const signInWithPassword = mock.fn(async () => ({ data: { session: null }, error: null }));
  renderLoginPage({ signInWithPassword });

  fireEvent.change(screen.getByTestId(TEST_IDS.LOGIN_EMAIL_INPUT), { target: { value: 'user@example.com' } });
  fireEvent.submit(screen.getByTestId(TEST_IDS.LOGIN_FORM));
  assert.equal(screen.getByTestId(TEST_IDS.LOGIN_ERROR).textContent, 'Password is required');

  fireEvent.change(screen.getByTestId(TEST_IDS.LOGIN_PASSWORD_INPUT), { target: { value: 'x' } });
  assert.equal(screen.queryByTestId(TEST_IDS.LOGIN_ERROR), null);
});

test('the login form does not enforce the signup password policy (existing accounts may predate it)', async () => {
  mockLoginAttemptAllowed();
  const signInWithPassword = mock.fn(async () => ({ data: { session: { access_token: 'token' } }, error: null }));
  renderLoginPage({ signInWithPassword });

  fireEvent.change(screen.getByTestId(TEST_IDS.LOGIN_EMAIL_INPUT), { target: { value: 'user@example.com' } });
  fireEvent.change(screen.getByTestId(TEST_IDS.LOGIN_PASSWORD_INPUT), { target: { value: 'abc' } });
  fireEvent.submit(screen.getByTestId(TEST_IDS.LOGIN_FORM));

  await waitFor(() => {
    assert.equal(signInWithPassword.mock.callCount(), 1);
  });
  // Let the submit handler finish (navigate + setSubmitting) before the test
  // ends, or it runs after teardown and throws "window is not defined".
  await new Promise((resolve) => setTimeout(resolve, 0));
});

test('the "Forgot your password?" and "Sign up" links navigate to their pages', async () => {
  const signInWithPassword = mock.fn(async () => ({ data: {}, error: null }));
  const auth = { signInWithPassword };
  const view = (path: string) =>
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage auth={auth as never} />} />
          <Route path={path} element={<div data-testid="landed" />} />
        </Routes>
      </MemoryRouter>,
    );

  view('/forgot-password');
  fireEvent.click(screen.getByTestId(TEST_IDS.LOGIN_FORGOT_PASSWORD_LINK));
  assert.ok(screen.getByTestId('landed'));
  cleanup();

  view('/signup');
  fireEvent.click(screen.getByTestId(TEST_IDS.LOGIN_SIGNUP_LINK));
  assert.ok(screen.getByTestId('landed'));
});
