import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupJsdom } from './setup/jsdom';

setupJsdom();

const { cleanup, render } = await import('@testing-library/react');
const { createRef } = await import('react');
const { Rect, Point } = await import('fabric');
const AnnotationCanvas = (await import('../src/annotation-canvas/AnnotationCanvas')).default as any;

afterEach(async () => {
  cleanup();
  // Fabric's text-editing mode attaches a hidden <textarea> with its own
  // async-deferred DOM listeners (IME/paste handling); one extra event-loop
  // turn lets those settle before jsdom (torn down in this file's `after()`)
  // disappears out from under them — same fix as tests/PDFViewer.test.tsx's
  // fitWidth race test.
  await new Promise((resolve) => setTimeout(resolve, 0));
});

// Drives the brush's own mouse handlers directly (bypassing real DOM events,
// which jsdom can't produce realistic drag physics for anyway) to produce a
// real Fabric `path:created` event, the same as an actual freehand stroke.
// Also fires the canvas-level `mouse:down` event first (AnnotationCanvas.jsx
// listens for that, not the brush's own handler, to capture which tool a
// stroke belongs to) — skipping it would silently bypass that capture.
function simulateStroke(canvas: any) {
  const brush = canvas.freeDrawingBrush;
  canvas.fire('mouse:down', { e: { clientX: 10, clientY: 10 } });
  brush.onMouseDown(new Point(10, 10), { e: { clientX: 10, clientY: 10 } });
  brush.onMouseMove(new Point(50, 50), { e: { clientX: 50, clientY: 50 } });
  brush.onMouseUp({ e: { clientX: 50, clientY: 50 } });
}

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
  // Pen's opacity is 1, so its live-preview brush color is fully opaque —
  // still the base red, just expressed as rgba so it's the same shape as a
  // semi-transparent tool's (see the highlighter test below).
  assert.equal(canvas.freeDrawingBrush.color, 'rgba(220, 38, 38, 1)');
  assert.equal(canvas.freeDrawingBrush.width, 4);
  assert.equal(canvas.upperCanvasEl.style.pointerEvents, 'auto');

  // 'rectangle' isn't implemented yet (task 2.8) and isn't click-to-place
  // either, so it's a genuinely non-interactive tool for this assertion.
  rerender(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} activeTool="rectangle" />);

  assert.equal(canvas.isDrawingMode, false, 'switching away from pen must turn drawing mode off');
  assert.equal(canvas.upperCanvasEl.style.pointerEvents, 'none', 'and stop intercepting pointer input');
});

test('a pen stroke renders fully opaque; a freeform-highlighter stroke of the same color/width renders semi-transparent', async () => {
  const ref = createRef<any>();
  const pdfDoc = fakePdfDoc(() => Promise.resolve(fakePage(1)));
  const { rerender } = render(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} activeTool="pen" />);

  const { wrapper, pdfCanvas } = makePageWrapper(600, 800);
  await ref.current.handlePageRendered(1, wrapper, pdfCanvas);
  const canvas = ref.current.getCanvas(1);

  simulateStroke(canvas);
  assert.equal(canvas.getObjects().length, 1);
  const penStroke = canvas.getObjects()[0];
  assert.equal(penStroke.opacity, 1, 'A3: pen strokes render fully opaque');

  rerender(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} activeTool="freeform-highlighter" />);
  assert.equal(canvas.isDrawingMode, true, 'freeform highlighter is also a free-drawing tool');
  assert.equal(
    canvas.freeDrawingBrush.color,
    'rgba(220, 38, 38, 0.35)',
    'the live in-progress stroke must preview semi-transparent too, not just the finished path',
  );

  simulateStroke(canvas);
  assert.equal(canvas.getObjects().length, 2);
  const highlighterStroke = canvas.getObjects()[1];
  assert.equal(highlighterStroke.stroke, penStroke.stroke, 'same base color as pen');
  assert.equal(highlighterStroke.strokeWidth, penStroke.strokeWidth, 'same base width as pen');
  assert.equal(highlighterStroke.opacity, 0.35, 'but semi-transparent, unlike the pen stroke above');
});

test('a stroke keeps the opacity of the tool active when it started, even if the tool changes before mouse-up', async () => {
  const ref = createRef<any>();
  const pdfDoc = fakePdfDoc(() => Promise.resolve(fakePage(1)));
  const { rerender } = render(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} activeTool="pen" />);

  const { wrapper, pdfCanvas } = makePageWrapper(600, 800);
  await ref.current.handlePageRendered(1, wrapper, pdfCanvas);
  const canvas = ref.current.getCanvas(1);

  // Start the stroke as Pen (fires the canvas-level mouse:down AnnotationCanvas
  // listens for, capturing the tool), then switch tools mid-drag — e.g. via
  // Tab-focus + Enter/Space on a toolbar button while the mouse is still
  // held down — before the stroke's mouse-up ever fires.
  canvas.fire('mouse:down', { e: { clientX: 10, clientY: 10 } });
  const brush = canvas.freeDrawingBrush;
  brush.onMouseDown(new Point(10, 10), { e: { clientX: 10, clientY: 10 } });
  brush.onMouseMove(new Point(50, 50), { e: { clientX: 50, clientY: 50 } });

  rerender(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} activeTool="freeform-highlighter" />);

  brush.onMouseUp({ e: { clientX: 50, clientY: 50 } });

  assert.equal(canvas.getObjects().length, 1);
  assert.equal(
    canvas.getObjects()[0].opacity,
    1,
    'the stroke belongs to Pen (active when it started), not the Highlighter that became active mid-drag',
  );
});

function stubBoundingClientRect(canvas: any, width: number, height: number) {
  // jsdom returns an all-zero rect by default, which degenerates the
  // scene-point math this canvas's click-to-place tools rely on.
  canvas.upperCanvasEl.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width,
    height,
    right: width,
    bottom: height,
  });
}

test('the text tool places an empty, editable Textbox at the clicked point in canvas coordinates', async () => {
  const ref = createRef<any>();
  const pdfDoc = fakePdfDoc(() => Promise.resolve(fakePage(1)));
  render(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} activeTool="text" />);

  const { wrapper, pdfCanvas } = makePageWrapper(600, 800); // 1x scale
  await ref.current.handlePageRendered(1, wrapper, pdfCanvas);
  const canvas = ref.current.getCanvas(1);
  stubBoundingClientRect(canvas, 600, 800);

  assert.equal(canvas.upperCanvasEl.style.pointerEvents, 'auto', 'text is click-to-place, not free-drawing, but still needs pointer input');

  canvas.fire('mouse:down', { e: { clientX: 120, clientY: 90 }, target: null });

  assert.equal(canvas.getObjects().length, 1);
  const textbox = canvas.getObjects()[0];
  assert.equal(textbox.left, 120, 'placed at the clicked point in logical (PDF-point) coordinates');
  assert.equal(textbox.top, 90);
  assert.equal(textbox.isEditing, true, 'drops the user straight into editing it');
});

test('clicking an existing object with the text tool active does not place a new text box on top of it', async () => {
  const ref = createRef<any>();
  const pdfDoc = fakePdfDoc(() => Promise.resolve(fakePage(1)));
  render(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} activeTool="text" />);

  const { wrapper, pdfCanvas } = makePageWrapper(600, 800);
  await ref.current.handlePageRendered(1, wrapper, pdfCanvas);
  const canvas = ref.current.getCanvas(1);
  stubBoundingClientRect(canvas, 600, 800);

  const existing = new Rect({ left: 10, top: 10, width: 50, height: 50 });
  canvas.add(existing);

  canvas.fire('mouse:down', { e: { clientX: 30, clientY: 30 }, target: existing });

  assert.equal(canvas.getObjects().length, 1, 'no new text box should be added on top of the clicked object');
});

test('an empty text box is removed once the user exits editing without typing anything', async () => {
  const ref = createRef<any>();
  const pdfDoc = fakePdfDoc(() => Promise.resolve(fakePage(1)));
  render(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} activeTool="text" />);

  const { wrapper, pdfCanvas } = makePageWrapper(600, 800);
  await ref.current.handlePageRendered(1, wrapper, pdfCanvas);
  const canvas = ref.current.getCanvas(1);
  stubBoundingClientRect(canvas, 600, 800);

  canvas.fire('mouse:down', { e: { clientX: 50, clientY: 50 }, target: null });
  const textbox = canvas.getObjects()[0];

  textbox.exitEditing();

  assert.equal(canvas.getObjects().length, 0, 'an untouched empty text box should not linger');
});

test('a text box with typed content survives exiting editing', async () => {
  const ref = createRef<any>();
  const pdfDoc = fakePdfDoc(() => Promise.resolve(fakePage(1)));
  render(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} activeTool="text" />);

  const { wrapper, pdfCanvas } = makePageWrapper(600, 800);
  await ref.current.handlePageRendered(1, wrapper, pdfCanvas);
  const canvas = ref.current.getCanvas(1);
  stubBoundingClientRect(canvas, 600, 800);

  canvas.fire('mouse:down', { e: { clientX: 50, clientY: 50 }, target: null });
  const textbox = canvas.getObjects()[0];
  textbox.text = 'hello';

  textbox.exitEditing();

  assert.equal(canvas.getObjects().length, 1, 'a text box the user actually typed into must be kept');
});
