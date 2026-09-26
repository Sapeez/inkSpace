import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupJsdom } from './setup/jsdom';

setupJsdom();

const { cleanup, render, screen } = await import('@testing-library/react');
const { default: PDFViewer } = await import('../src/viewer/PDFViewer');

afterEach(() => {
  cleanup();
});

test('shows the loading indicator while the document is loading', () => {
  render(<PDFViewer pdfDoc={null} loading={true} error={null} />);

  assert.ok(screen.getByTestId('pdf-loading-indicator'));
});

test('does not show the loading indicator once loading has finished with no document', () => {
  render(<PDFViewer pdfDoc={null} loading={false} error={null} />);

  assert.equal(screen.queryByTestId('pdf-loading-indicator'), null);
});

test('shows the error message instead of the loading indicator when loading fails', () => {
  render(<PDFViewer pdfDoc={null} loading={false} error="Failed to load document" />);

  assert.equal(screen.queryByTestId('pdf-loading-indicator'), null);
  assert.equal(screen.getByRole('alert').textContent, 'Failed to load document');
});
