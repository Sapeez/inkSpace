import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupJsdom } from './setup/jsdom';
import { TEST_IDS } from './consts/inkSpace';

setupJsdom();

const { cleanup, fireEvent, render, screen } = await import('@testing-library/react');
const { default: NotesPanel } = await import('../src/viewer/NotesPanel');

afterEach(() => {
  cleanup();
});

test('P4: the notes control is closed by default and opens on click', () => {
  render(<NotesPanel />);

  assert.equal(screen.queryByTestId(TEST_IDS.NOTES_PANEL), null);
  fireEvent.click(screen.getByTestId(TEST_IDS.NOTES_BUTTON));
  assert.ok(screen.getByTestId(TEST_IDS.NOTES_PANEL));
});

test('P4: typing and adding a note shows it in the list, and it can be removed', () => {
  render(<NotesPanel />);
  fireEvent.click(screen.getByTestId(TEST_IDS.NOTES_BUTTON));

  fireEvent.change(screen.getByTestId(TEST_IDS.NOTES_PANEL_INPUT), { target: { value: 'Check page 3' } });
  fireEvent.click(screen.getByTestId(TEST_IDS.NOTES_PANEL_ADD_BUTTON));

  const items = screen.getAllByTestId(TEST_IDS.NOTES_PANEL_ITEM);
  assert.equal(items.length, 1);
  assert.ok(items[0]?.textContent?.includes('Check page 3'));

  fireEvent.click(screen.getByRole('button', { name: 'Remove note' }));
  assert.equal(screen.queryAllByTestId(TEST_IDS.NOTES_PANEL_ITEM).length, 0);
});

test('P4: an empty note is not added', () => {
  render(<NotesPanel />);
  fireEvent.click(screen.getByTestId(TEST_IDS.NOTES_BUTTON));

  fireEvent.click(screen.getByTestId(TEST_IDS.NOTES_PANEL_ADD_BUTTON));
  assert.equal(screen.queryAllByTestId(TEST_IDS.NOTES_PANEL_ITEM).length, 0);
});
