import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupJsdom } from './setup/jsdom';

setupJsdom();

const { cleanup, render, screen } = await import('@testing-library/react');
const { default: EmptyState } = await import('../src/workspace/EmptyState');

afterEach(() => {
  cleanup();
});

test('design req 3.3: the "files" variant shows a distinct no-files message', () => {
  render(<EmptyState variant="files" testId="empty-files" />);
  const node = screen.getByTestId('empty-files');
  assert.match(node.textContent ?? '', /no files/i);
});

test('design req 3.3: the "folders" variant shows a distinct no-folders message', () => {
  render(<EmptyState variant="folders" testId="empty-folders" />);
  const node = screen.getByTestId('empty-folders');
  assert.match(node.textContent ?? '', /no folders/i);
});
