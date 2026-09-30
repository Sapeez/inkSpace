import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { getMostVisiblePageNumber, scrollToPage } from './viewerPageTracking';

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const SCALE_STEP = 0.25;
// Accumulated wheel deltaY (px) that triggers one SCALE_STEP.
const WHEEL_ZOOM_THRESHOLD = 40;

// Risk R2/task 5.2: how far past the visible viewport (in CSS pixels, along
// the scroll axis) a page is still eagerly rasterized — large enough that a
// normal scroll or a fit-width-sized page's worth of momentum doesn't
// outrun rendering and show a blank page, small enough that a huge document
// still only renders a handful of pages up front instead of all of them.
const VIEWPORT_RENDER_BUFFER_PX = 1000;

interface PDFViewerProps {
  pdfDoc: PDFDocumentProxy | null;
  loading: boolean;
  error: string | null;
  // Escape hatch for AnnotationCanvas.jsx, which layers a Fabric canvas over
  // each page's DOM. This file rebuilds that DOM wholesale on every zoom or
  // document change (replaceChildren + re-render page by page), so a sibling
  // can't just read `pdf-page-<n>` once — it needs to know exactly when a
  // page's DOM is (re)created and when it's about to be torn down, so it can
  // reattach without leaking Fabric's internal listeners or losing state.
  onPageRendered?: (pageNumber: number, pageWrapper: HTMLDivElement, pdfCanvas: HTMLCanvasElement) => void;
  onPagesReset?: () => void;
  // Editor only: builds a pdf.js text layer over each page (transparent,
  // selectable text) so text can be hovered (I-beam) and selected for markup.
  // The read-only preview leaves this off — no text is selectable there (V8).
  textLayer?: boolean;
}

interface PanState {
  pointerId: number;
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  // Text-layer spans count: dragging across text selects it instead of panning.
  return target instanceof Element && target.closest('button, input, a, .pdf-text-layer span') !== null;
}

export default function PDFViewer({
  pdfDoc,
  loading: documentLoading,
  error: documentError,
  onPageRendered,
  onPagesReset,
  textLayer = false,
}: PDFViewerProps) {
  const viewerRef = useRef<HTMLDivElement>(null);
  const pagesContainerRef = useRef<HTMLDivElement>(null);
  const prevPdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const lastVisiblePageRef = useRef<number | null>(null);
  const lastScrollLeftFractionRef = useRef(0);
  const forceFlushLeftRef = useRef(false);
  const panStateRef = useRef<PanState | null>(null);
  const [rendering, setRendering] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [isPanning, setIsPanning] = useState(false);

  // Deliberately assigned during render, not inside an effect: async callers
  // like fitWidth() need the value as of the most recent render, and a passive
  // effect would still be showing the previous one when their `await` resumes.
  // Safe only because nothing here uses startTransition/useDeferredValue/Suspense
  // today — a discarded speculative render would leave a phantom value in these
  // refs until the next real render overwrites it. Revisit if that changes.
  const latestPdfDocRef = useRef(pdfDoc);
  latestPdfDocRef.current = pdfDoc;
  const latestScaleRef = useRef(scale);
  latestScaleRef.current = scale;
  const latestOnPageRenderedRef = useRef(onPageRendered);
  latestOnPageRenderedRef.current = onPageRendered;
  const latestOnPagesResetRef = useRef(onPagesReset);
  latestOnPagesResetRef.current = onPagesReset;
  const textLayerEnabledRef = useRef(textLayer);
  textLayerEnabledRef.current = textLayer;

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
    const textLayers: Array<{ cancel: () => void }> = [];
    let observer: IntersectionObserver | null = null;
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

    interface PageEntry {
      pageNumber: number;
      page: Awaited<ReturnType<typeof doc.getPage>>;
      viewport: ReturnType<Awaited<ReturnType<typeof doc.getPage>>['getViewport']>;
      pageWrapper: HTMLDivElement;
      rendered: boolean;
    }

    // Risk R2/task 5.2: rasterizing a page (`page.render`) is the expensive
    // part — building this placeholder is not (`getPage` parses the page
    // dict, not its content stream), so every page's wrapper is created
    // up front, sized to its real viewport, keeping the container's total
    // scroll height (and therefore thumbnail/page-jump navigation, which
    // scrolls straight to a `pdf-page-<n>` id that must already exist) exact
    // from the start — only the actual `page.render()` call is deferred.
    async function renderOnePage(entry: PageEntry) {
      if (entry.rendered || cancelled) return;
      entry.rendered = true;
      observer?.unobserve(entry.pageWrapper);

      const canvas = document.createElement('canvas');
      canvas.className = 'pdf-viewer-canvas';
      // Back the canvas with device pixels (not CSS pixels) and size it in CSS
      // pixels, otherwise HiDPI screens upscale the bitmap and it looks blurry.
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.floor(entry.viewport.width * pixelRatio);
      canvas.height = Math.floor(entry.viewport.height * pixelRatio);
      canvas.style.width = `${entry.viewport.width}px`;
      canvas.style.height = `${entry.viewport.height}px`;
      entry.pageWrapper.appendChild(canvas);

      const renderTask = entry.page.render({
        canvas,
        viewport: entry.viewport,
        ...(pixelRatio !== 1 ? { transform: [pixelRatio, 0, 0, pixelRatio, 0, 0] } : {}),
      });
      renderTasks.push(renderTask);
      await renderTask.promise;
      if (cancelled) return;

      latestOnPageRenderedRef.current?.(entry.pageNumber, entry.pageWrapper, canvas);

      if (textLayerEnabledRef.current) {
        // Not awaited: the page is already usable; text selection just becomes
        // available a moment later. A failure only means no selectable text.
        buildTextLayer(entry).catch((err) => {
          if (!cancelled) console.warn('PDFViewer: could not build text layer', err);
        });
      }
    }

    async function buildTextLayer(entry: PageEntry) {
      if (typeof entry.page.streamTextContent !== 'function') return;
      // Loaded lazily so the read-only preview and tests never pull it in.
      const { TextLayer } = await import('pdfjs-dist');
      if (cancelled || !entry.pageWrapper.isConnected) return;

      const container = document.createElement('div');
      container.className = 'pdf-text-layer';
      container.style.setProperty('--total-scale-factor', String(entry.viewport.scale));
      entry.pageWrapper.appendChild(container);

      const layer = new TextLayer({
        textContentSource: entry.page.streamTextContent(),
        container,
        viewport: entry.viewport,
      });
      textLayers.push(layer);
      await layer.render();
    }

    async function renderPages() {
      try {
        const pageEntries: PageEntry[] = [];

        for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
          if (cancelled) return;

          const page = await doc.getPage(pageNumber);
          if (cancelled) return;

          const viewport = page.getViewport({ scale: effectiveScale });

          const pageWrapper = document.createElement('div');
          pageWrapper.className = 'pdf-viewer-page';
          pageWrapper.id = `pdf-page-${pageNumber}`;
          pageWrapper.style.width = `${viewport.width}px`;
          pageWrapper.style.height = `${viewport.height}px`;
          pagesContainerRef.current?.appendChild(pageWrapper);

          pageEntries.push({ pageNumber, page, viewport, pageWrapper, rendered: false });
        }
        if (cancelled) return;

        // Every page's placeholder now exists — this is where progressive
        // rendering (5.2) takes over from the old "render every page inline,
        // in this same loop" approach: only the page the user is about to
        // land on renders synchronously (so the loading indicator can clear
        // deterministically); every other page renders lazily, on demand,
        // via the observer below, so a large document's first page appears
        // without waiting for the whole document to rasterize.
        const initialTargetPage = previousPage ?? 1;
        const initialEntry = pageEntries.find((entry) => entry.pageNumber === initialTargetPage) ?? pageEntries[0];
        if (initialEntry) await renderOnePage(initialEntry);
        if (cancelled) return;

        // Environments without IntersectionObserver (none of this repo's
        // jsdom-based component tests define it — see PDFViewer.test.tsx)
        // fall back to rendering every remaining page eagerly, same as
        // before 5.2, rather than silently never rendering the rest of the
        // document.
        if (typeof IntersectionObserver === 'undefined') {
          for (const entry of pageEntries) {
            if (cancelled) return;
            await renderOnePage(entry);
          }
        } else {
          const entryByWrapper = new Map<Element, PageEntry>(pageEntries.map((entry) => [entry.pageWrapper, entry]));
          observer = new IntersectionObserver(
            (entries) => {
              entries.forEach((intersectionEntry) => {
                if (!intersectionEntry.isIntersecting) return;
                const entry = entryByWrapper.get(intersectionEntry.target);
                if (!entry) return;
                // Fire-and-forget from an IntersectionObserver callback, which
                // can't be awaited — but a rejection here (a real pdf.js render
                // failure, not just a cancelled in-flight task) must still
                // surface visibly, not vanish as an unhandled rejection while
                // leaving the page permanently blank (entry.rendered is set
                // synchronously at the top of renderOnePage, so it would never
                // be retried otherwise).
                renderOnePage(entry).catch((err) => {
                  if (cancelled) return;
                  setRenderError(err instanceof Error ? err.message : 'Failed to render page');
                });
              });
            },
            { root: viewerRef.current, rootMargin: `${VIEWPORT_RENDER_BUFFER_PX}px` },
          );
          pageEntries.forEach((entry) => {
            if (!entry.rendered) observer!.observe(entry.pageWrapper);
          });
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
      observer?.disconnect();
      renderTasks.forEach((task) => task.cancel());
      textLayers.forEach((layer) => layer.cancel());
      latestOnPagesResetRef.current?.();
      const container = viewerRef.current;
      if (container) {
        lastVisiblePageRef.current = getMostVisiblePageNumber(container);
        if (forceFlushLeftRef.current) {
          // A fitWidth() call already set lastScrollLeftFractionRef to 0 — don't
          // clobber it with the pre-fit (possibly panned-right) scroll position.
          forceFlushLeftRef.current = false;
        } else {
          const scrollableWidth = container.scrollWidth - container.clientWidth;
          lastScrollLeftFractionRef.current = scrollableWidth > 0 ? container.scrollLeft / scrollableWidth : 0;
        }
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

  const zoomInRef = useRef(zoomIn);
  zoomInRef.current = zoomIn;
  const zoomOutRef = useRef(zoomOut);
  zoomOutRef.current = zoomOut;

  // Ctrl/Cmd + mouse wheel, and trackpad pinch (browsers report pinch as a
  // wheel event with ctrlKey set). Attached natively rather than via React's
  // `onWheel`, which is passive and so can't preventDefault the browser's own
  // page zoom. Deltas are accumulated into discrete SCALE_STEPs because every
  // scale change re-renders the whole document; events arriving mid-render
  // are swallowed (still preventDefault'd) rather than queued.
  const renderingRef = useRef(rendering);
  renderingRef.current = rendering;
  useEffect(() => {
    const container = viewerRef.current;
    if (!container) return;
    let accumulated = 0;
    function handleWheel(event: WheelEvent) {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      if (renderingRef.current) {
        accumulated = 0;
        return;
      }
      accumulated += event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      if (Math.abs(accumulated) < WHEEL_ZOOM_THRESHOLD) return;
      if (accumulated < 0) zoomInRef.current();
      else zoomOutRef.current();
      accumulated = 0;
    }
    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  async function fitWidth() {
    if (!pdfDoc || rendering) return;
    const targetDoc = pdfDoc;
    const targetScale = scale;
    const page = await targetDoc.getPage(1);
    if (latestPdfDocRef.current !== targetDoc || latestScaleRef.current !== targetScale) return;

    const availableWidth = viewerRef.current?.clientWidth ?? 0;
    const nativeWidth = page.getViewport({ scale: 1 }).width;
    if (availableWidth <= 0 || nativeWidth <= 0) {
      console.warn('PDFViewer: cannot compute fit-width scale, viewer or page width unavailable');
      return;
    }

    // Floor, not round: fit-width must never overflow the viewer's width.
    const fitScale = Math.floor((availableWidth / nativeWidth) * 100) / 100;
    const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, fitScale));
    if (nextScale === scale) return;

    lastScrollLeftFractionRef.current = 0;
    forceFlushLeftRef.current = true;
    setScale(nextScale);
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
    <div className="pdf-viewer-column">
      <div className="zoom-controls" data-testid="zoom-controls" onPointerDown={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="zoom-controls-button zoom-controls-button--divider"
          data-testid="fit-width-button"
          disabled={!pdfDoc || rendering}
          onClick={fitWidth}
        >
          Fit width
        </button>
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
      <div className="pdf-viewer-pages" ref={pagesContainerRef} />
    </div>
    </div>
  );
}
