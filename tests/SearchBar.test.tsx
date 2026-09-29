import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { setupJsdom } from './setup/jsdom';
import { TEST_IDS } from './consts/inkSpace';

setupJsdom();

const { cleanup, fireEvent, render, screen } = await import('@testing-library/react');
const { default: SearchBar } = await import('../src/workspace/SearchBar');

afterEach(() => {
  cleanup();
});

test('WF11: typing in the search input calls onChange with the new value', () => {
  const onChange = mock.fn();
  render(<SearchBar value="" onChange={onChange} />);

  fireEvent.change(screen.getByTestId(TEST_IDS.SEARCH_INPUT), { target: { value: 'invoice' } });

  assert.equal(onChange.mock.callCount(), 1);
  assert.equal(onChange.mock.calls[0]?.arguments[0], 'invoice');
});

test('WF11: the input reflects the current value prop', () => {
  render(<SearchBar value="contract" onChange={() => {}} />);
  assert.equal((screen.getByTestId(TEST_IDS.SEARCH_INPUT) as HTMLInputElement).value, 'contract');
});
