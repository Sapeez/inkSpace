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
    assert.ok(!screen.getByTestId(TEST_IDS.FIT_WIDTH_BUTTON).hasAttribute('disabled'), 'fit-width button still disabled');
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

// 5.2/Risk R2: a controllable stand-in for the real IntersectionObserver
// (jsdom has no layout, so it can't compute real intersections) — lets a test
// simulate "this page just scrolled into the buffered viewport" by calling
// `.trigger()` directly, exercising PDFViewer's own virtualization logic
// (which page render calls it makes, and when) independent of real browser
// geometry.
function getGlobalIntersectionObserver(): unknown {
  return Reflect.get(globalThis, 'IntersectionObserver');
}

function setGlobalIntersectionObserver(value: unknown): void {
  Reflect.set(globalThis, 'IntersectionObserver', value);
}

function makeFakeIntersectionObserver(callback: IntersectionObserverCallback) {
  const observed = new Set<Element>();
  return {
    // Exposed (not just tracked internally) so a test can assert the
    // component actually subscribed a given page to the observer — without
    // this, `.trigger()` below would "work" even if the real component never
    // called `.observe()` for that page at all, since `.trigger()` invokes
    // the stored callback directly rather than checking membership itself.
    observed,
    observe(target: Element) {
      observed.add(target);
    },
    unobserve(target: Element) {
      observed.delete(target);
    },
    disconnect() {
      observed.clear();
    },
    trigger(target: Element, isIntersecting: boolean) {
      callback([{ target, isIntersecting } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    },
  };
}

test('5.2: only the target page renders eagerly; the rest render lazily as they intersect the buffered viewport', async () => {
  const originalIntersectionObserver = getGlobalIntersectionObserver();
  const instances: ReturnType<typeof makeFakeIntersectionObserver>[] = [];
  setGlobalIntersectionObserver(function (this: unknown, callback: IntersectionObserverCallback) {
    const instance = makeFakeIntersectionObserver(callback);
    instances.push(instance);
    return instance;
  });

  try {
    const renderedPages: number[] = [];
    const fakePage = (pageNumber: number) => ({
      getViewport: ({ scale = 1 }: { scale?: number } = {}) => ({ width: 600 * scale, height: 800 * scale }),
      render: () => {
        renderedPages.push(pageNumber);
        return { promise: Promise.resolve(), cancel: () => {} };
      },
    });

    const fakePdfDoc = {
      numPages: 3,
      getPage: (pageNumber: number) => Promise.resolve(fakePage(pageNumber)),
    };

    const onPageRendered = (pageNumber: number) => {
      // no-op — this test only cares about pdf.js's own `render()` calls.
      void pageNumber;
    };

    render(
      <PDFViewer
        pdfDoc={fakePdfDoc as unknown as PDFDocumentProxy}
        loading={false}
        error={null}
        onPageRendered={onPageRendered}
      />,
    );

    await waitFor(() => {
      assert.equal(screen.queryByTestId(TEST_IDS.LOADING_INDICATOR), null, 'still loading');
    });

    assert.deepEqual(renderedPages, [1], 'only page 1 (the initial target) should render up front');

    const observer = instances.at(-1)!;
    const page2Wrapper = document.getElementById('pdf-page-2')!;
    const page3Wrapper = document.getElementById('pdf-page-3')!;
    assert.ok(page2Wrapper, 'every page gets a placeholder wrapper up front, even before it renders');
    assert.ok(page3Wrapper, 'page 3 also has a placeholder, for correct scroll height');
    assert.equal(page2Wrapper.querySelector('canvas'), null, 'page 2 has no canvas yet — it has not rendered');
    // Proves the component actually subscribed the not-yet-rendered pages to
    // the observer — without this, `.trigger()` below would still "work" (it
    // invokes the stored callback directly) even if the component forgot to
    // call `.observe()` at all, which would mean these pages never lazily
    // render against a *real* IntersectionObserver in production.
    assert.ok(observer.observed.has(page2Wrapper), 'page 2 must be subscribed to the observer');
    assert.ok(observer.observed.has(page3Wrapper), 'page 3 must be subscribed to the observer');

    observer.trigger(page2Wrapper, true);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(renderedPages, [1, 2], 'page 2 renders once the observer reports it intersecting');
    assert.equal(
      page3Wrapper.querySelector('canvas'),
      null,
      'page 3 still has not rendered — it never intersected',
    );
  } finally {
    setGlobalIntersectionObserver(originalIntersectionObserver);
  }
});
