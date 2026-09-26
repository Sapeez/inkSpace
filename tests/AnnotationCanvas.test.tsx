import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupJsdom } from './setup/jsdom';

setupJsdom();

const { cleanup, render } = await import('@testing-library/react');
const { createRef } = await import('react');
const { Rect } = await import('fabric');
const AnnotationCanvas = (await import('../src/annotation-canvas/AnnotationCanvas')).default as any;

afterEach(() => {
  cleanup();
});

function fakePage(scale: number, nativeWidth = 600, nativeHeight = 800) {
  return {
    getViewport: ({ scale: s = 1 }: { scale?: number } = {}) => ({
      width: nativeWidth * s,
      height: nativeHeight * s,
    }),
  };
}

function fakePdfDoc(getPage: (pageNumber: number) => Promise<ReturnType<typeof fakePage>>) {
  return { numPages: 1, getPage };
}

function makePageWrapper(pdfCanvasWidth: number, pdfCanvasHeight: number) {
  const wrapper = document.createElement('div');
  document.body.appendChild(wrapper);
  const pdfCanvas = document.createElement('canvas');
  pdfCanvas.width = pdfCanvasWidth;
  pdfCanvas.height = pdfCanvasHeight;
  wrapper.appendChild(pdfCanvas);
  return { wrapper, pdfCanvas };
}

test('creates a Fabric canvas backing store sized to the on-screen scale', async () => {
  const ref = createRef<any>();
  const pdfDoc = fakePdfDoc(() => Promise.resolve(fakePage(1)));
  render(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} />);

  const { wrapper, pdfCanvas } = makePageWrapper(900, 1200); // on-screen = 1.5x of native 600x800
  await ref.current.handlePageRendered(1, wrapper, pdfCanvas);

  const overlay = wrapper.querySelector('.annotation-overlay-canvas') as HTMLCanvasElement;
  assert.ok(overlay, 'overlay canvas should be appended into the page wrapper');
  assert.equal(overlay.width, 900);
  assert.equal(overlay.height, 1200);
});

test('annotation object coordinates survive a rescale (dispose, serialize, reload) unchanged', async () => {
  const ref = createRef<any>();
  const pdfDoc = fakePdfDoc(() => Promise.resolve(fakePage(1)));
  render(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} />);

  const { wrapper: wrapperA, pdfCanvas: pdfCanvasA } = makePageWrapper(600, 800); // 1x
  await ref.current.handlePageRendered(1, wrapperA, pdfCanvasA);

  const canvasA = ref.current.getCanvas(1);
  canvasA.add(new Rect({ left: 100, top: 120, width: 50, height: 30 }));

  // Simulate PDFViewer tearing down every page's DOM ahead of a rescale.
  ref.current.handlePagesReset();
  wrapperA.remove();

  const { wrapper: wrapperB, pdfCanvas: pdfCanvasB } = makePageWrapper(450, 600); // 0.75x
  await ref.current.handlePageRendered(1, wrapperB, pdfCanvasB);

  const canvasB = ref.current.getCanvas(1);
  const restored = canvasB.getObjects()[0];
  assert.equal(restored.left, 100, 'logical left must be unchanged across the rescale');
  assert.equal(restored.top, 120, 'logical top must be unchanged across the rescale');
});

test('a stale handlePageRendered call does not dispose the correct canvas built after it', async () => {
  let getPageCalls = 0;
  let resolveFirstGetPage: () => void = () => {};

  const pdfDoc = fakePdfDoc(() => {
    getPageCalls += 1;
    if (getPageCalls === 1) {
      return new Promise((resolve) => {
        resolveFirstGetPage = () => resolve(fakePage(1));
      });
    }
    return Promise.resolve(fakePage(1));
  });

  const ref = createRef<any>();
  render(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} />);

  // Call #1 starts and suspends on the held-open getPage promise — mirrors a
  // page render that was still in flight when a zoom/rescale landed.
  const { wrapper: wrapperA, pdfCanvas: pdfCanvasA } = makePageWrapper(600, 800);
  const staleCall = ref.current.handlePageRendered(1, wrapperA, pdfCanvasA);
  assert.equal(getPageCalls, 1);

  // PDFViewer's effect cleanup runs (handlePagesReset), then tears down and
  // detaches the old page wrapper before rebuilding it at the new scale.
  ref.current.handlePagesReset();
  wrapperA.remove();

  // The new render for the same page completes fully before call #1 resumes.
  const { wrapper: wrapperB, pdfCanvas: pdfCanvasB } = makePageWrapper(450, 600);
  await ref.current.handlePageRendered(1, wrapperB, pdfCanvasB);
  const correctCanvas = ref.current.getCanvas(1);
  assert.ok(correctCanvas, 'the second, correct canvas should be tracked');

  // Only now does the stale call #1 resume.
  resolveFirstGetPage();
  await staleCall;

  assert.equal(
    ref.current.getCanvas(1),
    correctCanvas,
    'the stale call must not have disposed/replaced the correct canvas',
  );
});

test('the pen tool puts the canvas into free-drawing mode with the default red 4pt solid brush', async () => {
  const ref = createRef<any>();
  const pdfDoc = fakePdfDoc(() => Promise.resolve(fakePage(1)));
  const { rerender } = render(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} activeTool="pen" />);

  const { wrapper, pdfCanvas } = makePageWrapper(600, 800);
  await ref.current.handlePageRendered(1, wrapper, pdfCanvas);

  const canvas = ref.current.getCanvas(1);
  assert.equal(canvas.isDrawingMode, true);
  assert.equal(canvas.freeDrawingBrush.color, '#dc2626');
  assert.equal(canvas.freeDrawingBrush.width, 4);
  assert.equal(canvas.upperCanvasEl.style.pointerEvents, 'auto');

  rerender(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} activeTool="text" />);

  assert.equal(canvas.isDrawingMode, false, 'switching away from pen must turn drawing mode off');
  assert.equal(canvas.upperCanvasEl.style.pointerEvents, 'none', 'and stop intercepting pointer input');
});
