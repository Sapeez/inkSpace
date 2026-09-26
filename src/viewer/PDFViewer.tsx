import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { getMostVisiblePageNumber, scrollToPage } from './viewerPageTracking';

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const SCALE_STEP = 0.25;

interface PDFViewerProps {
  pdfDoc: PDFDocumentProxy | null;
  loading: boolean;
  error: string | null;
}

interface PanState {
  pointerId: number;
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('button, input, a') !== null;
}

export default function PDFViewer({ pdfDoc, loading: documentLoading, error: documentError }: PDFViewerProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const pagesContainerRef = useRef<HTMLDivElement>(null);
  const prevPdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const lastVisiblePageRef = useRef<number | null>(null);
  const lastScrollLeftFractionRef = useRef(0);
  const panStateRef = useRef<PanState | null>(null);
  const [rendering, setRendering] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [isPanning, setIsPanning] = useState(false);

  function cancelPan() {
    const panState = panStateRef.current;
    if (!panState) return;
    viewerRef.current?.releasePointerCapture(panState.pointerId);
    panStateRef.current = null;
    setIsPanning(false);
  }

  useEffect(() => {
    let cancelled = false;
    const renderTasks: RenderTask[] = [];
    const isNewDocument = prevPdfDocRef.current !== pdfDoc;
    const effectiveScale = isNewDocument ? 1 : scale;
    const previousPage = isNewDocument ? null : lastVisiblePageRef.current;
    prevPdfDocRef.current = pdfDoc;
    if (isNewDocument) {
      cancelPan();
      if (scale !== 1) setScale(1);
    }

    pagesContainerRef.current?.replaceChildren();
    setRenderError(null);
    setRendering(true);

    if (!pdfDoc) {
      return undefined;
    }
    const doc = pdfDoc;

    async function renderPages() {
      try {
        for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
          if (cancelled) return;

          const page = await doc.getPage(pageNumber);
          if (cancelled) return;

          const viewport = page.getViewport({ scale: effectiveScale });

          const pageWrapper = document.createElement('div');
          pageWrapper.className = 'pdf-viewer-page';
          pageWrapper.id = `pdf-page-${pageNumber}`;

          const canvas = document.createElement('canvas');
          canvas.className = 'pdf-viewer-canvas';
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          pageWrapper.appendChild(canvas);
          pagesContainerRef.current?.appendChild(pageWrapper);

          const renderTask = page.render({ canvas, viewport });
          renderTasks.push(renderTask);
          await renderTask.promise;
          if (cancelled) return;
        }

        if (!cancelled) {
          setRendering(false);
          if (previousPage !== null) {
            scrollToPage(previousPage, 'auto');
            const container = viewerRef.current;
            if (container) {
              container.scrollLeft = lastScrollLeftFractionRef.current * (container.scrollWidth - container.clientWidth);
            }
          }
        }
      } catch (err) {
        if (cancelled) return;
        setRenderError(err instanceof Error ? err.message : 'Failed to render page');
        setRendering(false);
      }
    }

    renderPages();

    return () => {
      cancelled = true;
      renderTasks.forEach((task) => task.cancel());
      const container = viewerRef.current;
      if (container) {
        lastVisiblePageRef.current = getMostVisiblePageNumber(container);
        const scrollableWidth = container.scrollWidth - container.clientWidth;
        lastScrollLeftFractionRef.current = scrollableWidth > 0 ? container.scrollLeft / scrollableWidth : 0;
      }
      pagesContainerRef.current?.replaceChildren();
    };
  }, [pdfDoc, scale]);

  function zoomIn() {
    setScale((current) => Math.min(MAX_SCALE, Math.round((current + SCALE_STEP) * 100) / 100));
  }

  function zoomOut() {
    setScale((current) => Math.max(MIN_SCALE, Math.round((current - SCALE_STEP) * 100) / 100));
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (scale <= 1 || rendering || event.button !== 0 || isInteractiveTarget(event.target)) return;
    if (panStateRef.current) return;
    const container = viewerRef.current;
    if (!container) return;

    panStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
    };
    container.setPointerCapture(event.pointerId);
    setIsPanning(true);
    event.preventDefault();
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const panState = panStateRef.current;
    const container = viewerRef.current;
    if (!panState || !container || panState.pointerId !== event.pointerId) return;

    container.scrollLeft = panState.scrollLeft - (event.clientX - panState.startX);
    container.scrollTop = panState.scrollTop - (event.clientY - panState.startY);
  }

  function endPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (panStateRef.current?.pointerId !== event.pointerId) return;
    cancelPan();
  }

  const loading = documentLoading || (pdfDoc !== null && rendering);
  const error = documentError ?? renderError;

  const pannable = scale > 1;

  return (
    <div
      className={`pdf-viewer${pannable ? ' pdf-viewer--pannable' : ''}${isPanning ? ' pdf-viewer--panning' : ''}`}
      data-testid="pdf-viewer"
      ref={viewerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPan}
      onPointerCancel={endPan}
    >
      {loading && (
        <div className="pdf-viewer-loading" data-testid="pdf-loading-indicator" role="status" aria-live="polite">
          Loading document…
        </div>
      )}
      {error && (
        <div className="pdf-viewer-error" role="alert">
          {error}
        </div>
      )}
      <div className="zoom-controls" data-testid="zoom-controls" onPointerDown={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="zoom-controls-button"
          data-testid="zoom-out-button"
          aria-label="Zoom out"
          disabled={!pdfDoc || rendering || scale <= MIN_SCALE}
          onClick={zoomOut}
        >
          −
        </button>
        <span className="zoom-controls-level">{Math.round(scale * 100)}%</span>
        <button
          type="button"
          className="zoom-controls-button"
          data-testid="zoom-in-button"
          aria-label="Zoom in"
          disabled={!pdfDoc || rendering || scale >= MAX_SCALE}
          onClick={zoomIn}
        >
          +
        </button>
      </div>
      <div className="pdf-viewer-pages" ref={pagesContainerRef} />
    </div>
  );
}
