import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { setupJsdom } from './setup/jsdom';
import { TEST_IDS } from './consts/inkSpace';

setupJsdom();

const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { MemoryRouter, Routes, Route } = await import('react-router-dom');
const { default: WorkspacePage } = await import('../src/workspace/WorkspacePage');

afterEach(() => {
  cleanup();
});

// LG4: logout must be reachable from the authenticated shell, and must
// actually end the session (via the injected `auth.signOut`) rather than
// just navigating away while a stale session lingers.
test('LG4: clicking logout calls signOut and returns to the login page', async () => {
  const signOut = mock.fn(async () => ({ error: null }));

  render(
    <MemoryRouter initialEntries={['/workspace']}>
      <Routes>
        <Route path="/workspace" element={<WorkspacePage auth={{ signOut } as never} />} />
        <Route path="/login" element={<div data-testid="login-landed" />} />
      </Routes>
    </MemoryRouter>,
  );

  fireEvent.click(screen.getByTestId(TEST_IDS.LOGOUT_BUTTON));

  await waitFor(() => {
    assert.ok(screen.getByTestId('login-landed'));
  });
  assert.equal(signOut.mock.callCount(), 1);
});
