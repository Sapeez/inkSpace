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

  // 'polygon' isn't implemented yet and isn't click-to-place either, so
  // it's a genuinely non-interactive tool for this assertion.
  rerender(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} activeTool="polygon" />);

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

test('the text highlighter drags out a filled, semi-transparent rectangle with no stroke', async () => {
  const ref = createRef<any>();
  const pdfDoc = fakePdfDoc(() => Promise.resolve(fakePage(1)));
  render(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} activeTool="text-highlighter" />);

  const { wrapper, pdfCanvas } = makePageWrapper(600, 800);
  await ref.current.handlePageRendered(1, wrapper, pdfCanvas);
  const canvas = ref.current.getCanvas(1);
  stubBoundingClientRect(canvas, 600, 800);

  assert.equal(canvas.upperCanvasEl.style.pointerEvents, 'auto', 'drag-to-place needs pointer input too');
  assert.equal(canvas.selection, false, "Fabric's own marquee-select must not compete with the drag");

  canvas.fire('mouse:down', { e: { clientX: 50, clientY: 200 }, target: null });
  canvas.fire('mouse:move', { e: { clientX: 250, clientY: 150 } });
  canvas.fire('mouse:up', {});

  assert.equal(canvas.getObjects().length, 1);
  const highlight = canvas.getObjects()[0];
  assert.equal(highlight.left, 50, 'normalized to the top-left corner regardless of drag direction');
  assert.equal(highlight.top, 150);
  assert.equal(highlight.width, 200);
  assert.equal(highlight.height, 50);
  assert.equal(highlight.fill, '#dc2626', 'same base color as the other tools, as a real fill, not baked-in alpha');
  assert.equal(highlight.opacity, 0.35, 'transparency is a real opacity property, not baked into the fill color');
  assert.equal(highlight.stroke, null, 'a highlight, not an outlined shape');
});

test('a text-highlighter drag too small to be a real highlight is discarded, not kept as a stray shape', async () => {
  const ref = createRef<any>();
  const pdfDoc = fakePdfDoc(() => Promise.resolve(fakePage(1)));
  render(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} activeTool="text-highlighter" />);

  const { wrapper, pdfCanvas } = makePageWrapper(600, 800);
  await ref.current.handlePageRendered(1, wrapper, pdfCanvas);
  const canvas = ref.current.getCanvas(1);
  stubBoundingClientRect(canvas, 600, 800);

  canvas.fire('mouse:down', { e: { clientX: 50, clientY: 50 }, target: null });
  canvas.fire('mouse:up', {});

  assert.equal(canvas.getObjects().length, 0, 'a click with no real drag should not leave a shape behind');
});

test('a text-highlighter drag exactly at the minimum threshold is kept, not discarded', async () => {
  const ref = createRef<any>();
  const pdfDoc = fakePdfDoc(() => Promise.resolve(fakePage(1)));
  render(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} activeTool="text-highlighter" />);

  const { wrapper, pdfCanvas } = makePageWrapper(600, 800); // 1x zoom
  await ref.current.handlePageRendered(1, wrapper, pdfCanvas);
  const canvas = ref.current.getCanvas(1);
  stubBoundingClientRect(canvas, 600, 800);

  // Exactly MIN_DRAG_SIZE_SCREEN_PX (4) in both dimensions at 1x zoom.
  canvas.fire('mouse:down', { e: { clientX: 50, clientY: 50 }, target: null });
  canvas.fire('mouse:move', { e: { clientX: 54, clientY: 54 } });
  canvas.fire('mouse:up', {});

  assert.equal(canvas.getObjects().length, 1, 'a drag exactly at the threshold must be kept, not discarded');
});

test('at low zoom, a single screen-pixel of jitter is still treated as an accidental click, not kept as a shape', async () => {
  const ref = createRef<any>();
  const pdfDoc = fakePdfDoc(() => Promise.resolve(fakePage(1)));
  render(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} activeTool="text-highlighter" />);

  const { wrapper, pdfCanvas } = makePageWrapper(300, 400); // 0.5x of native 600x800
  await ref.current.handlePageRendered(1, wrapper, pdfCanvas);
  const canvas = ref.current.getCanvas(1);
  stubBoundingClientRect(canvas, 300, 400);
  assert.equal(canvas.getZoom(), 0.5);

  // Only 1 screen pixel of movement — ordinary click jitter — but at 0.5x
  // zoom this maps to 2 scene units, which would have crossed a naive,
  // zoom-independent minimum-drag-size threshold.
  canvas.fire('mouse:down', { e: { clientX: 50, clientY: 50 }, target: null });
  canvas.fire('mouse:move', { e: { clientX: 51, clientY: 51 } });
  canvas.fire('mouse:up', {});

  assert.equal(
    canvas.getObjects().length,
    0,
    '1 screen pixel of jitter at low zoom must not leave a stray highlight',
  );
});

test('clicking an existing object with the text highlighter active does not start a new drag on top of it', async () => {
  const ref = createRef<any>();
  const pdfDoc = fakePdfDoc(() => Promise.resolve(fakePage(1)));
  render(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} activeTool="text-highlighter" />);

  const { wrapper, pdfCanvas } = makePageWrapper(600, 800);
  await ref.current.handlePageRendered(1, wrapper, pdfCanvas);
  const canvas = ref.current.getCanvas(1);
  stubBoundingClientRect(canvas, 600, 800);

  const existing = new Rect({ left: 10, top: 10, width: 50, height: 50 });
  canvas.add(existing);

  canvas.fire('mouse:down', { e: { clientX: 30, clientY: 30 }, target: existing });
  canvas.fire('mouse:move', { e: { clientX: 200, clientY: 200 } });
  canvas.fire('mouse:up', {});

  assert.equal(canvas.getObjects().length, 1, 'no highlight rectangle should have started');
});

test('an empty text box still mid-edit does not survive a page reset (e.g. the user zoomed instead of clicking away)', async () => {
  const ref = createRef<any>();
  const pdfDoc = fakePdfDoc(() => Promise.resolve(fakePage(1)));
  render(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} activeTool="text" />);

  const { wrapper, pdfCanvas } = makePageWrapper(600, 800);
  await ref.current.handlePageRendered(1, wrapper, pdfCanvas);
  const canvas = ref.current.getCanvas(1);
  stubBoundingClientRect(canvas, 600, 800);

  // Places an empty Textbox and enters editing — then the user clicks a
  // zoom button (outside the canvas entirely) instead of clicking away on
  // the canvas or typing anything, so Fabric's own on-canvas deselect
  // handling (the only thing that would normally fire editing:exited) never
  // runs.
  canvas.fire('mouse:down', { e: { clientX: 50, clientY: 50 }, target: null });
  assert.equal(canvas.getActiveObject()?.isEditing, true);

  ref.current.handlePagesReset();

  await ref.current.handlePageRendered(1, wrapper, pdfCanvas);
  const reloadedCanvas = ref.current.getCanvas(1);
  assert.equal(
    reloadedCanvas.getObjects().length,
    0,
    'an untouched empty text box must not survive a reset while still mid-edit',
  );
});

test('a tool switch away from text while a box is empty and mid-edit exits editing instead of leaving a stray cursor', async () => {
  const ref = createRef<any>();
  const pdfDoc = fakePdfDoc(() => Promise.resolve(fakePage(1)));
  const { rerender } = render(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} activeTool="text" />);

  const { wrapper, pdfCanvas } = makePageWrapper(600, 800);
  await ref.current.handlePageRendered(1, wrapper, pdfCanvas);
  const canvas = ref.current.getCanvas(1);
  stubBoundingClientRect(canvas, 600, 800);

  canvas.fire('mouse:down', { e: { clientX: 50, clientY: 50 }, target: null });
  assert.equal(canvas.getObjects().length, 1);

  rerender(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} activeTool="pen" />);

  assert.equal(canvas.getObjects().length, 0, 'switching tools while empty must clean it up, not strand it mid-edit');
});

test('the rectangle tool drags out an unfilled outline rectangle (A4: fill default transparent)', async () => {
  const ref = createRef<any>();
  const pdfDoc = fakePdfDoc(() => Promise.resolve(fakePage(1)));
  render(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} activeTool="rectangle" />);

  const { wrapper, pdfCanvas } = makePageWrapper(600, 800);
  await ref.current.handlePageRendered(1, wrapper, pdfCanvas);
  const canvas = ref.current.getCanvas(1);
  stubBoundingClientRect(canvas, 600, 800);

  assert.equal(canvas.selection, false);

  canvas.fire('mouse:down', { e: { clientX: 300, clientY: 350 }, target: null });
  canvas.fire('mouse:move', { e: { clientX: 50, clientY: 150 } });
  canvas.fire('mouse:up', {});

  assert.equal(canvas.getObjects().length, 1);
  const rect = canvas.getObjects()[0];
  assert.equal(rect.left, 50, 'normalized to the top-left corner regardless of drag direction');
  assert.equal(rect.top, 150);
  assert.equal(rect.width, 250);
  assert.equal(rect.height, 200);
  assert.equal(rect.fill, null, 'A4: fill defaults to transparent');
  assert.equal(rect.stroke, '#dc2626');
  assert.equal(rect.strokeWidth, 4);
  assert.ok(!rect.strokeDashArray, 'A2: outlines render solid only');
});

test('the ellipse tool drags out an unfilled outline ellipse sized to the drag box', async () => {
  const ref = createRef<any>();
  const pdfDoc = fakePdfDoc(() => Promise.resolve(fakePage(1)));
  render(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} activeTool="ellipse" />);

  const { wrapper, pdfCanvas } = makePageWrapper(600, 800);
  await ref.current.handlePageRendered(1, wrapper, pdfCanvas);
  const canvas = ref.current.getCanvas(1);
  stubBoundingClientRect(canvas, 600, 800);

  canvas.fire('mouse:down', { e: { clientX: 50, clientY: 100 }, target: null });
  canvas.fire('mouse:move', { e: { clientX: 250, clientY: 200 } });
  canvas.fire('mouse:up', {});

  assert.equal(canvas.getObjects().length, 1);
  const ellipse = canvas.getObjects()[0];
  assert.equal(ellipse.left, 50);
  assert.equal(ellipse.top, 100);
  assert.equal(ellipse.rx, 100, 'half the drag width');
  assert.equal(ellipse.ry, 50, 'half the drag height');
  assert.equal(ellipse.fill, null, 'A4: fill defaults to transparent');
  assert.equal(ellipse.stroke, '#dc2626');
});

test('a rectangle/ellipse drag too small to be real is discarded, not kept as a stray shape', async () => {
  const ref = createRef<any>();
  const pdfDoc = fakePdfDoc(() => Promise.resolve(fakePage(1)));
  render(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} activeTool="rectangle" />);

  const { wrapper, pdfCanvas } = makePageWrapper(600, 800);
  await ref.current.handlePageRendered(1, wrapper, pdfCanvas);
  const canvas = ref.current.getCanvas(1);
  stubBoundingClientRect(canvas, 600, 800);

  canvas.fire('mouse:down', { e: { clientX: 50, clientY: 50 }, target: null });
  canvas.fire('mouse:up', {});

  assert.equal(canvas.getObjects().length, 0);
});

test('the cloud tool drags out an unfilled, wavy-bordered shape sized to the drag box', async () => {
  const ref = createRef<any>();
  const pdfDoc = fakePdfDoc(() => Promise.resolve(fakePage(1)));
  render(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} activeTool="cloud" />);

  const { wrapper, pdfCanvas } = makePageWrapper(600, 800);
  await ref.current.handlePageRendered(1, wrapper, pdfCanvas);
  const canvas = ref.current.getCanvas(1);
  stubBoundingClientRect(canvas, 600, 800);

  canvas.fire('mouse:down', { e: { clientX: 50, clientY: 60 }, target: null });
  canvas.fire('mouse:move', { e: { clientX: 250, clientY: 160 } });
  canvas.fire('mouse:up', {});

  assert.equal(canvas.getObjects().length, 1);
  const cloud = canvas.getObjects()[0];
  assert.equal(cloud.type, 'path', 'a wavy border is a Path (arcs), not a plain Rect');
  assert.equal(cloud.fill, null, 'A4: fill defaults to transparent');
  assert.equal(cloud.stroke, '#dc2626');
  assert.equal(cloud.strokeWidth, 4);
  assert.ok(!cloud.strokeDashArray, 'A2: outlines render solid only');
  // Bounding box should roughly match the 200x100 drag box — the wavy path
  // bows outward past the nominal box by roughly one bump size, not by an
  // amount that would indicate the box was computed some other way.
  const CLOUD_BUMP_SIZE = 20; // mirrors AnnotationCanvas.jsx's own constant
  assert.ok(Math.abs(cloud.width - 200) <= CLOUD_BUMP_SIZE, `width ${cloud.width} should be close to the 200-unit drag width`);
  assert.ok(Math.abs(cloud.height - 100) <= CLOUD_BUMP_SIZE, `height ${cloud.height} should be close to the 100-unit drag height`);
});

test('resizing a cloud mid-drag replaces the shape instance rather than mutating it, without leaking the old one', async () => {
  const ref = createRef<any>();
  const pdfDoc = fakePdfDoc(() => Promise.resolve(fakePage(1)));
  render(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} activeTool="cloud" />);

  const { wrapper, pdfCanvas } = makePageWrapper(600, 800);
  await ref.current.handlePageRendered(1, wrapper, pdfCanvas);
  const canvas = ref.current.getCanvas(1);
  stubBoundingClientRect(canvas, 600, 800);

  canvas.fire('mouse:down', { e: { clientX: 50, clientY: 60 }, target: null });
  const firstCloud = canvas.getObjects()[0];

  canvas.fire('mouse:move', { e: { clientX: 250, clientY: 160 } });
  assert.equal(canvas.getObjects().length, 1, 'the old, smaller cloud must be removed, not left behind alongside the new one');
  const secondCloud = canvas.getObjects()[0];
  assert.notEqual(secondCloud, firstCloud, 'resize produced a new Path instance, as the wavy border requires');

  canvas.fire('mouse:up', {});
  assert.equal(canvas.getObjects().length, 1);
});

test('a thin cloud (bracketing a single line of text) renders at its actual dragged height, not inflated to the bump size', async () => {
  const ref = createRef<any>();
  const pdfDoc = fakePdfDoc(() => Promise.resolve(fakePage(1)));
  render(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} activeTool="cloud" />);

  const { wrapper, pdfCanvas } = makePageWrapper(600, 800);
  await ref.current.handlePageRendered(1, wrapper, pdfCanvas);
  const canvas = ref.current.getCanvas(1);
  stubBoundingClientRect(canvas, 600, 800);

  // 200 wide, only 10 tall — thinner than CLOUD_BUMP_SIZE (20). A real,
  // intentional drag like this must not get inflated up to 20 the way a
  // genuinely zero-size (mouse:down-only) cloud correctly does.
  canvas.fire('mouse:down', { e: { clientX: 50, clientY: 100 }, target: null });
  canvas.fire('mouse:move', { e: { clientX: 250, clientY: 110 } });
  canvas.fire('mouse:up', {});

  assert.equal(canvas.getObjects().length, 1);
  const cloud = canvas.getObjects()[0];
  // The wavy border always bows outward past the nominal box by roughly one
  // bump radius (confirmed empirically: with the real 10-unit height the
  // path's bounding-box height is ~30; if it were incorrectly floored to
  // the 20-unit bump size instead, it would be ~40) — so the correct
  // discriminator is "closer to the un-inflated value," not "under 20."
  assert.ok(cloud.height < 35, `height ${cloud.height} must reflect the actual 10-unit drag, not the inflated 20-unit bump-size floor`);
});

test('a too-small cloud drag is discarded, not kept as a stray shape', async () => {
  const ref = createRef<any>();
  const pdfDoc = fakePdfDoc(() => Promise.resolve(fakePage(1)));
  render(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} activeTool="cloud" />);

  const { wrapper, pdfCanvas } = makePageWrapper(600, 800);
  await ref.current.handlePageRendered(1, wrapper, pdfCanvas);
  const canvas = ref.current.getCanvas(1);
  stubBoundingClientRect(canvas, 600, 800);

  canvas.fire('mouse:down', { e: { clientX: 50, clientY: 50 }, target: null });
  canvas.fire('mouse:up', {});

  assert.equal(canvas.getObjects().length, 0);
});

test('the line tool drags out a straight line between the two drag points', async () => {
  const ref = createRef<any>();
  const pdfDoc = fakePdfDoc(() => Promise.resolve(fakePage(1)));
  render(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} activeTool="line" />);

  const { wrapper, pdfCanvas } = makePageWrapper(600, 800);
  await ref.current.handlePageRendered(1, wrapper, pdfCanvas);
  const canvas = ref.current.getCanvas(1);
  stubBoundingClientRect(canvas, 600, 800);

  canvas.fire('mouse:down', { e: { clientX: 20, clientY: 30 }, target: null });
  canvas.fire('mouse:move', { e: { clientX: 220, clientY: 130 } });
  canvas.fire('mouse:up', {});

  assert.equal(canvas.getObjects().length, 1);
  const line = canvas.getObjects()[0];
  assert.equal(line.x1, 20);
  assert.equal(line.y1, 30);
  assert.equal(line.x2, 220);
  assert.equal(line.y2, 130);
  assert.equal(line.stroke, '#dc2626');
  assert.equal(line.strokeWidth, 4);
});

test('the arrow tool drags out a one-sided arrow (a solid arrowhead only at the drag end point)', async () => {
  const ref = createRef<any>();
  const pdfDoc = fakePdfDoc(() => Promise.resolve(fakePage(1)));
  render(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} activeTool="arrow" />);

  const { wrapper, pdfCanvas } = makePageWrapper(600, 800);
  await ref.current.handlePageRendered(1, wrapper, pdfCanvas);
  const canvas = ref.current.getCanvas(1);
  stubBoundingClientRect(canvas, 600, 800);

  canvas.fire('mouse:down', { e: { clientX: 20, clientY: 30 }, target: null });
  canvas.fire('mouse:move', { e: { clientX: 220, clientY: 30 } });
  canvas.fire('mouse:up', {});

  assert.equal(canvas.getObjects().length, 1);
  const arrow = canvas.getObjects()[0];
  assert.equal(arrow.type, 'path', 'a single Path, not a Group of a line + a separate arrowhead shape');
  assert.equal(arrow.fill, '#dc2626', 'the arrowhead is a solid, filled triangle');
  assert.equal(arrow.stroke, '#dc2626');
  // Horizontal drag (20,30) -> (220,30): the arrow's bounding box should
  // span the full drag width and be centered vertically around y=30, with
  // some extra height for the arrowhead's width sticking out above/below
  // the shaft line.
  assert.ok(arrow.width >= 200, 'spans at least the full shaft length');
  assert.ok(arrow.height > 0, 'the arrowhead adds height beyond the zero-height shaft alone');
  assert.ok(!arrow.strokeDashArray, 'A2: outlines render solid only');
});

test('a short arrow (shorter than the head length) never lets the shaft overshoot past the start point', async () => {
  const ref = createRef<any>();
  const pdfDoc = fakePdfDoc(() => Promise.resolve(fakePage(1)));
  render(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} activeTool="arrow" />);

  const { wrapper, pdfCanvas } = makePageWrapper(600, 800);
  await ref.current.handlePageRendered(1, wrapper, pdfCanvas);
  const canvas = ref.current.getCanvas(1);
  stubBoundingClientRect(canvas, 600, 800);

  // Full arrowhead length (at BASE_STROKE_WIDTH=4) is 12 units; this drag is
  // only 8 — shorter than the head, so the head must shrink to fit rather
  // than walking its "back" point past the start of the drag.
  canvas.fire('mouse:down', { e: { clientX: 100, clientY: 100 }, target: null });
  canvas.fire('mouse:move', { e: { clientX: 108, clientY: 100 } });
  canvas.fire('mouse:up', {});

  assert.equal(canvas.getObjects().length, 1);
  const arrow = canvas.getObjects()[0];
  // The path's own bounding box must stay within (a small stroke-width
  // margin around) the drag's start/end x-range — it must not extend to the
  // left of the start point the way an unclamped 12-unit-long head would
  // (back = 108 - 12 = 96, to the left of start = 100).
  // An unclamped 12-unit-long head on an 8-unit drag would make the whole
  // path noticeably wider than the drag itself (empirically ~12, vs. ~8 when
  // correctly clamped to the drag's own length) — a small margin allows for
  // stroke-width padding in Fabric's own bounding-box calculation without
  // letting the actual bug (a head bigger than the drag) pass.
  assert.ok(arrow.width <= 10, 'the head must be clamped to the drag length, not fixed-size and overshooting it');
});

test('a line/arrow drag too short to be real is discarded, not kept as a stray shape', async () => {
  const ref = createRef<any>();
  const pdfDoc = fakePdfDoc(() => Promise.resolve(fakePage(1)));
  render(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} activeTool="arrow" />);

  const { wrapper, pdfCanvas } = makePageWrapper(600, 800);
  await ref.current.handlePageRendered(1, wrapper, pdfCanvas);
  const canvas = ref.current.getCanvas(1);
  stubBoundingClientRect(canvas, 600, 800);

  canvas.fire('mouse:down', { e: { clientX: 50, clientY: 50 }, target: null });
  canvas.fire('mouse:up', {});

  assert.equal(canvas.getObjects().length, 0);
});

test('clicking an existing object with a shape tool active does not start a new drag on top of it', async () => {
  const ref = createRef<any>();
  const pdfDoc = fakePdfDoc(() => Promise.resolve(fakePage(1)));
  render(<AnnotationCanvas ref={ref} attachmentId="a1" pdfDoc={pdfDoc} activeTool="rectangle" />);

  const { wrapper, pdfCanvas } = makePageWrapper(600, 800);
  await ref.current.handlePageRendered(1, wrapper, pdfCanvas);
  const canvas = ref.current.getCanvas(1);
  stubBoundingClientRect(canvas, 600, 800);

  const existing = new Rect({ left: 10, top: 10, width: 50, height: 50 });
  canvas.add(existing);

  canvas.fire('mouse:down', { e: { clientX: 30, clientY: 30 }, target: existing });
  canvas.fire('mouse:move', { e: { clientX: 200, clientY: 200 } });
  canvas.fire('mouse:up', {});

  assert.equal(canvas.getObjects().length, 1, 'no new shape should have started on top of it');
});
