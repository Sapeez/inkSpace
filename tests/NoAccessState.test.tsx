import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupJsdom } from './setup/jsdom';
import { TEST_IDS } from './consts/inkSpace';

setupJsdom();

const { cleanup, render, screen } = await import('@testing-library/react');
const { default: NoAccessState } = await import('../src/viewer/NoAccessState');

afterEach(() => {
  cleanup();
});

test('P5: renders a defined empty state, not a blank screen', () => {
  render(<NoAccessState />);

  const state = screen.getByTestId(TEST_IDS.EMPTY_STATE);
  assert.ok(state);
  assert.ok(state.textContent && state.textContent.length > 0);
});
