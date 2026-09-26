import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { setupJsdom } from './setup/jsdom';
import { TEST_IDS } from './consts/inkSpace';

setupJsdom();

const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { default: PDFViewer } = await import('../src/viewer/PDFViewer');

afterEach(() => {
  cleanup();
});

test('shows the loading indicator while the document is loading', () => {
  render(<PDFViewer pdfDoc={null} loading={true} error={null} />);

  assert.ok(screen.getByTestId(TEST_IDS.LOADING_INDICATOR));
});

test('does not show the loading indicator once loading has finished with no document', () => {
  render(<PDFViewer pdfDoc={null} loading={false} error={null} />);

  assert.equal(screen.queryByTestId(TEST_IDS.LOADING_INDICATOR), null);
});

test('shows the error message instead of the loading indicator when loading fails', () => {
  render(<PDFViewer pdfDoc={null} loading={false} error="Failed to load document" />);

  assert.equal(screen.queryByTestId(TEST_IDS.LOADING_INDICATOR), null);
  assert.equal(screen.getByRole('alert').textContent, 'Failed to load document');
});

test('fitWidth ignores a stale result if the scale changed while it was still computing', async () => {
  let getPageCalls = 0;
  let resolvePendingGetPage: () => void = () => {};

  const fakePage = {
    getViewport: ({ scale = 1 }: { scale?: number } = {}) => ({ width: 600 * scale, height: 800 * scale }),
    render: () => ({ promise: Promise.resolve(), cancel: () => {} }),
  };

  const fakePdfDoc = {
    numPages: 1,
    getPage: () => {
      getPageCalls += 1;
      // Call #1 is the initial page-render pass. Call #2 is fitWidth()'s own
      // lookup — held open until the test resolves it. Any later call (e.g.
      // the zoom-in click below also re-triggers PDFViewer's own render
      // effect, which calls getPage again to redraw at the new scale) must
      // resolve immediately, or that unrelated re-render would hang too.
      if (getPageCalls === 2) {
        return new Promise<typeof fakePage>((resolve) => {
          resolvePendingGetPage = () => resolve(fakePage);
        });
      }
      return Promise.resolve(fakePage);
    },
  };

  const { container } = render(
    <PDFViewer pdfDoc={fakePdfDoc as unknown as PDFDocumentProxy} loading={false} error={null} />,
  );

  await waitFor(() => {
    assert.ok(!screen.getByTestId(TEST_IDS.FIT_WIDTH_BUTTON).hasAttribute('disabled'));
  });

  const viewerEl = container.querySelector(`[data-testid="${TEST_IDS.PDF_VIEWER}"]`) as HTMLElement;
  Object.defineProperty(viewerEl, 'clientWidth', { configurable: true, value: 1200 });

  fireEvent.click(screen.getByTestId(TEST_IDS.FIT_WIDTH_BUTTON));
  assert.equal(getPageCalls, 2, 'fitWidth should have started its own getPage(1) call');

  fireEvent.click(screen.getByTestId(TEST_IDS.ZOOM_IN_BUTTON));
  assert.equal(container.querySelector('.zoom-controls-level')?.textContent, '125%');

  resolvePendingGetPage();
  await new Promise((resolve) => setTimeout(resolve, 0));

  await waitFor(() => {
    assert.equal(
      container.querySelector('.zoom-controls-level')?.textContent,
      '125%',
      'fitWidth resolving late must not overwrite the zoom-in click that happened while it was pending',
    );
  });
});
