import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Canvas } from 'fabric';

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
const AnnotationCanvas = forwardRef(function AnnotationCanvas({ attachmentId, pdfDoc }, ref) {
  const canvasesRef = useRef(new Map()); // pageNumber -> fabric.Canvas
  const savedStateRef = useRef(new Map()); // pageNumber -> fabric JSON (PDF point coords)
  const pdfDocRef = useRef(pdfDoc);

  if (pdfDocRef.current !== pdfDoc) {
    // A genuinely different document — nothing to carry forward.
    savedStateRef.current = new Map();
    pdfDocRef.current = pdfDoc;
  }

  useImperativeHandle(
    ref,
    () => ({
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
        if (pdfDocRef.current !== doc) return; // a newer document has since loaded

        const nativeViewport = page.getViewport({ scale: 1 });

        const overlayEl = document.createElement('canvas');
        overlayEl.className = 'annotation-overlay-canvas';
        pageWrapper.appendChild(overlayEl);

        const canvas = new Canvas(overlayEl, {
          width: nativeViewport.width,
          height: nativeViewport.height,
          selection: true,
        });

        const screenWidth = pdfCanvasEl.width;
        const screenHeight = pdfCanvasEl.height;
        const scale = nativeViewport.width > 0 ? screenWidth / nativeViewport.width : 1;
        canvas.setDimensions({ width: screenWidth, height: screenHeight });
        canvas.setZoom(scale);

        const savedJson = savedStateRef.current.get(pageNumber);
        if (savedJson) {
          await canvas.loadFromJSON(savedJson);
          canvas.requestRenderAll();
        }

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
