import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Canvas, PencilBrush } from 'fabric';

// Global style defaults (A4) — color default red, stroke width default 4pt.
// Fabric's stroke `width` is in this canvas's own logical units, which are
// PDF points (see the coordinate-space note below), so "4pt" is simply `4`,
// no conversion needed. StyleControls (task 2.10) will make these
// user-configurable; until then every tool that draws uses these constants.
const DEFAULT_STROKE_COLOR = '#dc2626';
const DEFAULT_STROKE_WIDTH = 4;

// Tools that free-draw directly on the canvas (put it in Fabric's drawing
// mode) rather than clicking/dragging to place a shape. Extend this as 2.5+
// tools land (Freeform Highlighter is the next one, also freehand).
const FREE_DRAWING_TOOLS = new Set(['pen']);

function applyActiveTool(canvas, activeTool) {
  const isFreeDrawing = FREE_DRAWING_TOOLS.has(activeTool);
  canvas.isDrawingMode = isFreeDrawing;
  if (isFreeDrawing) {
    if (!canvas.freeDrawingBrush) canvas.freeDrawingBrush = new PencilBrush(canvas);
    canvas.freeDrawingBrush.color = DEFAULT_STROKE_COLOR;
    canvas.freeDrawingBrush.width = DEFAULT_STROKE_WIDTH;
    // All line-based marks render solid only (A2); opacity fixed at 100%,
    // not configurable (A3) — never set strokeDashArray or opacity < 1 here.
  }

  // No tool needs pointer input yet unless it free-draws (selection/move/
  // resize lands in 2.13). Keep the overlay out of the way of pan/zoom-
  // controls clicks otherwise.
  canvas.upperCanvasEl.style.pointerEvents = isFreeDrawing ? 'auto' : 'none';
}

// PDFViewer.tsx owns the actual page DOM and rebuilds it wholesale on every
// zoom/document change (it has no stable per-page DOM to attach to across
// scale changes). Rather than guessing at that timing via a MutationObserver,
// PDFViewer.tsx calls back into this component's imperative handle exactly
// when a page's DOM is ready (`handlePageRendered`) and exactly when the
// current page DOM is about to be torn down (`handlePagesReset`) — see
// ViewerPage.jsx for the wiring. This lets a Fabric canvas be attached,
// reattached at the new on-screen size, or disposed without racing PDFViewer.
//
// Each page's Fabric canvas is created at the page's *native* (scale: 1) PDF
// point dimensions and kept there for its whole life — only `setZoom`/
// `setDimensions` change when the on-screen scale changes. That means every
// annotation object's own coordinates (`left`/`top`/etc.) always stay in PDF
// point space, never screen-pixel space, which is what keeps burn-in position
// matching the on-screen position at any zoom level (Risk R1).
// `attachmentId` isn't used yet — kept in the signature for the save/load
// wiring in task 3.x (persisting/loading the annotation JSON per attachment).
const AnnotationCanvas = forwardRef(function AnnotationCanvas({ attachmentId, pdfDoc, activeTool }, ref) {
  const canvasesRef = useRef(new Map()); // pageNumber -> fabric.Canvas
  const savedStateRef = useRef(new Map()); // pageNumber -> fabric JSON (PDF point coords)
  const pdfDocRef = useRef(pdfDoc);
  // "Latest ref" pattern (same convention as PDFViewer.tsx): handlePageRendered
  // is async and called imperatively from outside React's render flow, so it
  // needs the tool that's active *now*, not whatever was active when its own
  // invocation started.
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;

  if (pdfDocRef.current !== pdfDoc) {
    // A genuinely different document — nothing to carry forward.
    savedStateRef.current = new Map();
    pdfDocRef.current = pdfDoc;
  }

  useEffect(() => {
    canvasesRef.current.forEach((canvas) => applyActiveTool(canvas, activeTool));
  }, [activeTool]);

  useImperativeHandle(
    ref,
    () => ({
      // Exposes the underlying Fabric canvas for a page — needed by future
      // tool wiring (2.4+, to enable drawing mode / add objects) and by tests.
      // Two things future callers must not do: (1) call `.dispose()` on the
      // returned instance themselves — this component doesn't know it's been
      // disposed and will still try to use it later; go through
      // `handlePagesReset`/a new page render instead. (2) add an object using
      // screen-space coordinates (e.g. straight from a click event) — objects
      // must be added in this canvas's own logical PDF-point space, since
      // that's what keeps burn-in position matching the on-screen position
      // at any zoom level (Risk R1). Use `canvas.getZoom()` (or an
      // `addObjectAtScreenPoint`-style helper, if one gets added later) to
      // convert first.
      getCanvas(pageNumber) {
        return canvasesRef.current.get(pageNumber) ?? null;
      },

      handlePagesReset() {
        canvasesRef.current.forEach((canvas, pageNumber) => {
          savedStateRef.current.set(pageNumber, canvas.toJSON());
          canvas.dispose();
        });
        canvasesRef.current.clear();
      },

      async handlePageRendered(pageNumber, pageWrapper, pdfCanvasEl) {
        const doc = pdfDocRef.current;
        if (!doc) return;

        const existing = canvasesRef.current.get(pageNumber);
        if (existing) {
          savedStateRef.current.set(pageNumber, existing.toJSON());
          existing.dispose();
          canvasesRef.current.delete(pageNumber);
        }

        const page = await doc.getPage(pageNumber);
        // Bail if a newer document has since loaded, or if PDFViewer already
        // tore this page's wrapper down (e.g. a rescale that landed while this
        // call was still awaiting getPage) — otherwise this stale call would
        // dispose the *correct*, already-attached canvas a later call just
        // built, and replace it in the tracking map with one attached to a
        // detached DOM node.
        if (pdfDocRef.current !== doc || !pageWrapper.isConnected) return;

        const nativeViewport = page.getViewport({ scale: 1 });

        const overlayEl = document.createElement('canvas');
        overlayEl.className = 'annotation-overlay-canvas';
        pageWrapper.appendChild(overlayEl);

        const canvas = new Canvas(overlayEl, {
          width: nativeViewport.width,
          height: nativeViewport.height,
          selection: true,
        });

        // While a free-drawing tool is active, a drag on this canvas must
        // draw, not pan the (scale > 1) view beneath it — PDFViewer.tsx's
        // pan handler listens on an ancestor (`.pdf-viewer`), so stopping
        // propagation here is what keeps the two from firing on the same
        // gesture. Checked live via `canvas.isDrawingMode`, not captured at
        // attach time, so it stays correct across tool changes.
        canvas.upperCanvasEl.addEventListener('pointerdown', (event) => {
          if (canvas.isDrawingMode) event.stopPropagation();
        });

        const screenWidth = pdfCanvasEl.width;
        const screenHeight = pdfCanvasEl.height;
        const scale = nativeViewport.width > 0 ? screenWidth / nativeViewport.width : 1;
        canvas.setDimensions({ width: screenWidth, height: screenHeight });
        canvas.setZoom(scale);

        const savedJson = savedStateRef.current.get(pageNumber);
        if (savedJson) {
          await canvas.loadFromJSON(savedJson);
        }
        // Applied after loadFromJSON (not just before) in case restoring
        // objects ever touches canvas-level interaction state.
        applyActiveTool(canvas, activeToolRef.current);
        canvas.requestRenderAll();

        canvasesRef.current.set(pageNumber, canvas);
      },
    }),
    [],
  );

  // Nothing of its own to render — every canvas is attached directly into
  // PDFViewer's page DOM via the imperative handle above.
  return null;
});

export default AnnotationCanvas;
