import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { setupJsdom } from './setup/jsdom';

setupJsdom();

const { cleanup, fireEvent, render, screen } = await import('@testing-library/react');
const { default: PageNavigator } = await import('../src/viewer/PageNavigator');

function fakePdfDoc(numPages: number): PDFDocumentProxy {
  return { numPages } as unknown as PDFDocumentProxy;
}

afterEach(() => {
  cleanup();
});

test('next/previous buttons move the current page and disable at the boundaries', () => {
  render(<PageNavigator pdfDoc={fakePdfDoc(3)} />);

  const prevButton = screen.getByTestId('prev-page-button');
  const nextButton = screen.getByTestId('next-page-button');
  const input = screen.getByTestId('current-page-input') as HTMLInputElement;

  assert.equal(input.value, '1');
  assert.ok(prevButton.hasAttribute('disabled'));

  fireEvent.click(nextButton);
  assert.equal(input.value, '2');
  assert.ok(!prevButton.hasAttribute('disabled'));

  fireEvent.click(nextButton);
  assert.equal(input.value, '3');
  assert.ok(nextButton.hasAttribute('disabled'));

  fireEvent.click(prevButton);
  assert.equal(input.value, '2');
});

test('typing a page number and pressing Enter jumps to that page', () => {
  render(<PageNavigator pdfDoc={fakePdfDoc(10)} />);
  const input = screen.getByTestId('current-page-input') as HTMLInputElement;

  fireEvent.change(input, { target: { value: '7' } });
  fireEvent.keyDown(input, { key: 'Enter' });

  assert.equal(input.value, '7');
});

test('an out-of-range page number clamps to the last page instead of jumping past it', () => {
  render(<PageNavigator pdfDoc={fakePdfDoc(5)} />);
  const input = screen.getByTestId('current-page-input') as HTMLInputElement;

  fireEvent.change(input, { target: { value: '99' } });
  fireEvent.keyDown(input, { key: 'Enter' });

  assert.equal(input.value, '5');
});

test('a non-numeric entry reverts to the current page instead of jumping', () => {
  render(<PageNavigator pdfDoc={fakePdfDoc(5)} />);
  const input = screen.getByTestId('current-page-input') as HTMLInputElement;

  fireEvent.change(input, { target: { value: 'abc' } });
  fireEvent.keyDown(input, { key: 'Enter' });

  assert.equal(input.value, '1');
});
