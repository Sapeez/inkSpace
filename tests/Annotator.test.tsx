import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupJsdom } from './setup/jsdom';
import { TEST_IDS, TEXT_CONTENT } from './consts/inkSpace';

setupJsdom();

const { cleanup, fireEvent, render, screen } = await import('@testing-library/react');
const { createRef, useState } = await import('react');
const { Rect } = await import('fabric');
const Toolbar = (await import('../src/toolbar/Toolbar.jsx')).default as any;
const AnnotationCanvas = (await import('../src/annotation-canvas/AnnotationCanvas')).default as any;
const ConfirmModal = (await import('../src/modals/ConfirmModal.jsx')).default as any;
const { DEFAULT_ANNOTATION_STYLE } = await import('../src/toolbar/StyleControls');

afterEach(async () => {
  cleanup();
  // Mirrors tests/AnnotationCanvas.test.tsx's afterEach: a native event
  // dispatched directly on `document` (the Delete/Backspace keydown tests
  // below, and the plain `.focus()` call) can leave React's own event
  // delegation with a state flush still scheduled for a later microtask/
  // macrotask, not necessarily settled by the time `cleanup()` returns. One
  // extra event-loop turn lets that settle before this file's `after()`
  // hook (in setupJsdom()) tears down jsdom's `window` out from under it.
  await new Promise((resolve) => setTimeout(resolve, 0));
});

// Toolbar/StyleControls/AnnotationCanvas/ConfirmModal are individually
// unit-tested elsewhere (Toolbar has no dedicated file yet, but StyleControls
// and AnnotationCanvas do). This file exercises the same wiring ViewerPage.jsx
// does between all four — tool activation flowing into AnnotationCanvas, a
// real StyleControls DOM interaction affecting future annotations only, and
// the full A6 delete-confirmation round trip (request -> confirm/cancel) —
// without pulling in PDFViewer/pdf.js, which none of this needs.
function fakePage(nativeWidth = 600, nativeHeight = 800) {
  return {
    getViewport: ({ scale: s = 1 }: { scale?: number } = {}) => ({
      width: nativeWidth * s,
      height: nativeHeight * s,
    }),
  };
}

function fakePdfDoc() {
  return { numPages: 1, getPage: () => Promise.resolve(fakePage()) };
}

function makePageWrapper(width = 600, height = 800) {
  const wrapper = document.createElement('div');
  document.body.appendChild(wrapper);
  const pdfCanvas = document.createElement('canvas');
  pdfCanvas.width = width;
  pdfCanvas.height = height;
  wrapper.appendChild(pdfCanvas);
  return { wrapper, pdfCanvas };
}

// Mirrors the exact composition ViewerPage.jsx uses (attachmentId/activeTool/
// style/onRequestDelete wiring, the "confirm calls deleteActiveObject then
// closes" and "cancel just closes" handlers, and the same literal testId
// strings) — see ViewerPage.jsx.
function Harness({ canvasRef }: { canvasRef: any }) {
  const [activeTool, setActiveTool] = useState('pen');
  const [style, setStyle] = useState(DEFAULT_ANNOTATION_STYLE);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  return (
    <>
      <Toolbar
        attachmentId="a1"
        activeTool={activeTool}
        onToolChange={setActiveTool}
        style={style}
        onStyleChange={setStyle}
        onSignaturePlace={() => false}
      />
      <AnnotationCanvas
        ref={canvasRef}
        attachmentId="a1"
        pdfDoc={fakePdfDoc()}
        activeTool={activeTool}
        style={style}
        onRequestDelete={() => setDeleteConfirmOpen(true)}
      />
      <ConfirmModal
        open={deleteConfirmOpen}
        title="Delete annotation?"
        message="Are you sure you want to delete this annotation?"
        onConfirm={() => {
          canvasRef.current?.deleteActiveObject();
          setDeleteConfirmOpen(false);
        }}
        onCancel={() => setDeleteConfirmOpen(false)}
        testId={TEST_IDS.DELETE_CONFIRM_MODAL}
        titleTestId={TEST_IDS.DELETE_CONFIRM_TITLE}
        messageTestId={TEST_IDS.DELETE_CONFIRM_MESSAGE}
        confirmTestId={TEST_IDS.DELETE_CONFIRM_BUTTON}
        cancelTestId={TEST_IDS.DELETE_CANCEL_BUTTON}
      />
    </>
  );
}

const CANVAS_TOOL_TEST_IDS = [
  TEST_IDS.TOOL_PEN,
  TEST_IDS.TOOL_FREEFORM_HIGHLIGHTER,
  TEST_IDS.TOOL_TEXT,
  TEST_IDS.TOOL_ELLIPSE,
  TEST_IDS.TOOL_RECTANGLE,
  TEST_IDS.TOOL_LINE,
  TEST_IDS.TOOL_ARROW,
  TEST_IDS.TOOL_CLOUD,
];

test('every canvas-gesture tool button can be activated and shows aria-pressed on only that button', () => {
  const canvasRef = createRef<any>();
  render(<Harness canvasRef={canvasRef} />);

  for (const testId of CANVAS_TOOL_TEST_IDS) {
    fireEvent.click(screen.getByTestId(testId));

    for (const otherTestId of CANVAS_TOOL_TEST_IDS) {
      const expected = otherTestId === testId ? 'true' : 'false';
      assert.equal(
        screen.getByTestId(otherTestId).getAttribute('aria-pressed'),
        expected,
        `after activating ${testId}, ${otherTestId} should have aria-pressed=${expected}`,
      );
    }
  }
});

test('changing the color picker affects annotations placed after the change, not ones already on the canvas', async () => {
  const canvasRef = createRef<any>();
  render(<Harness canvasRef={canvasRef} />);

  fireEvent.click(screen.getByTestId(TEST_IDS.TOOL_RECTANGLE));

  const { wrapper, pdfCanvas } = makePageWrapper();
  await canvasRef.current.handlePageRendered(1, wrapper, pdfCanvas);
  const canvas = canvasRef.current.getCanvas(1);
  canvas.upperCanvasEl.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 800, right: 600, bottom: 800 });
  canvas.lowerCanvasEl.getBoundingClientRect = canvas.upperCanvasEl.getBoundingClientRect;

  canvas.fire('mouse:down', { e: { clientX: 50, clientY: 50 }, target: null });
  canvas.fire('mouse:move', { e: { clientX: 150, clientY: 150 } });
  canvas.fire('mouse:up', {});
  const firstRect = canvas.getObjects()[0];
  assert.equal(firstRect.stroke, DEFAULT_ANNOTATION_STYLE.color);
  canvas.discardActiveObject();

  fireEvent.click(screen.getByTestId(TEST_IDS.STYLE_COLOR_PICKER));
  fireEvent.change(screen.getByTestId(TEST_IDS.STYLE_COLOR_HEX), { target: { value: '#2563eb' } });

  canvas.fire('mouse:down', { e: { clientX: 300, clientY: 300 }, target: null });
  canvas.fire('mouse:move', { e: { clientX: 400, clientY: 400 } });
  canvas.fire('mouse:up', {});
  const secondRect = canvas.getObjects()[1];

  assert.equal(firstRect.stroke, DEFAULT_ANNOTATION_STYLE.color, 'the already-placed rectangle must keep the old color');
  assert.equal(secondRect.stroke, '#2563eb', 'the rectangle placed after the change must use the new color');
});

test('pressing Delete on a selected annotation opens the delete-confirmation modal with the exact required text', async () => {
  const canvasRef = createRef<any>();
  render(<Harness canvasRef={canvasRef} />);

  const { wrapper, pdfCanvas } = makePageWrapper();
  await canvasRef.current.handlePageRendered(1, wrapper, pdfCanvas);
  const canvas = canvasRef.current.getCanvas(1);

  const existing = new Rect({ left: 10, top: 10, width: 50, height: 50 });
  canvas.add(existing);
  canvas.setActiveObject(existing);

  assert.equal(screen.queryByTestId(TEST_IDS.DELETE_CONFIRM_MODAL), null, 'not shown before Delete is pressed');

  fireEvent.keyDown(document, { key: 'Delete' });

  assert.equal(screen.getByTestId(TEST_IDS.DELETE_CONFIRM_TITLE).textContent, TEXT_CONTENT.DELETE_MODAL_TITLE);
  assert.equal(screen.getByTestId(TEST_IDS.DELETE_CONFIRM_MESSAGE).textContent, TEXT_CONTENT.DELETE_MODAL_MESSAGE);
  assert.equal(canvas.getObjects().length, 1, 'requesting confirmation must not delete anything by itself');
});

test('pressing Delete with nothing selected does not open the modal', async () => {
  const canvasRef = createRef<any>();
  render(<Harness canvasRef={canvasRef} />);

  const { wrapper, pdfCanvas } = makePageWrapper();
  await canvasRef.current.handlePageRendered(1, wrapper, pdfCanvas);

  fireEvent.keyDown(document, { key: 'Delete' });

  assert.equal(screen.queryByTestId(TEST_IDS.DELETE_CONFIRM_MODAL), null);
});

test('cancelling the delete-confirmation modal leaves the annotation untouched', async () => {
  const canvasRef = createRef<any>();
  render(<Harness canvasRef={canvasRef} />);

  const { wrapper, pdfCanvas } = makePageWrapper();
  await canvasRef.current.handlePageRendered(1, wrapper, pdfCanvas);
  const canvas = canvasRef.current.getCanvas(1);

  const existing = new Rect({ left: 10, top: 10, width: 50, height: 50 });
  canvas.add(existing);
  canvas.setActiveObject(existing);

  fireEvent.keyDown(document, { key: 'Delete' });
  fireEvent.click(screen.getByTestId(TEST_IDS.DELETE_CANCEL_BUTTON));

  assert.equal(screen.queryByTestId(TEST_IDS.DELETE_CONFIRM_MODAL), null, 'the modal must close on cancel');
  assert.equal(canvas.getObjects().length, 1, 'cancelling must not remove the annotation');
  assert.equal(canvas.getObjects()[0], existing);
});

test('confirming the delete-confirmation modal removes the selected annotation', async () => {
  const canvasRef = createRef<any>();
  render(<Harness canvasRef={canvasRef} />);

  const { wrapper, pdfCanvas } = makePageWrapper();
  await canvasRef.current.handlePageRendered(1, wrapper, pdfCanvas);
  const canvas = canvasRef.current.getCanvas(1);

  const existing = new Rect({ left: 10, top: 10, width: 50, height: 50 });
  canvas.add(existing);
  canvas.setActiveObject(existing);

  fireEvent.keyDown(document, { key: 'Delete' });
  fireEvent.click(screen.getByTestId(TEST_IDS.DELETE_CONFIRM_BUTTON));

  assert.equal(screen.queryByTestId(TEST_IDS.DELETE_CONFIRM_MODAL), null, 'the modal must close after confirming');
  assert.equal(canvas.getObjects().length, 0, 'the annotation must be removed');
});

test('Backspace inside a real form control does not open the delete-confirmation modal', async () => {
  const canvasRef = createRef<any>();
  render(<Harness canvasRef={canvasRef} />);

  const { wrapper, pdfCanvas } = makePageWrapper();
  await canvasRef.current.handlePageRendered(1, wrapper, pdfCanvas);
  const canvas = canvasRef.current.getCanvas(1);

  const existing = new Rect({ left: 10, top: 10, width: 50, height: 50 });
  canvas.add(existing);
  canvas.setActiveObject(existing);

  // Focus a real form control (the stroke-width input) before pressing
  // Backspace, simulating the user editing that field while an annotation
  // happens to still be selected elsewhere.
  const widthPicker = screen.getByTestId(TEST_IDS.STYLE_WIDTH_PICKER);
  widthPicker.focus();

  fireEvent.keyDown(document, { key: 'Backspace' });

  assert.equal(screen.queryByTestId(TEST_IDS.DELETE_CONFIRM_MODAL), null);
  assert.equal(canvas.getObjects().length, 1, 'the annotation must still be there');
});
