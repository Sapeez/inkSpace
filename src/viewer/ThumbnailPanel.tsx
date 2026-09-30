import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { getMostVisiblePageNumber, scrollToPage } from './viewerPageTracking';

const THUMBNAIL_SCALE = 0.2;

interface ThumbnailPanelProps {
  pdfDoc: PDFDocumentProxy | null;
}

export default function ThumbnailPanel({ pdfDoc }: ThumbnailPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  // Read by the (async) thumbnail creation below so a thumbnail that finishes
  // after the highlight effect already ran still gets the right state.
  const currentPageRef = useRef(1);

  // Same most-visible-page rule PageNavigator uses, tracked from the viewer's scroll.
  useEffect(() => {
    setCurrentPage(1);
    const container = document.querySelector('.pdf-viewer');
    if (!container) return undefined;

    let frame: number | null = null;
    function handleScroll() {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        const visiblePage = getMostVisiblePageNumber(container as Element);
        if (visiblePage !== null) setCurrentPage(visiblePage);
      });
    }

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [pdfDoc]);

  useEffect(() => {
    currentPageRef.current = currentPage;
    containerRef.current?.querySelectorAll<HTMLElement>('.thumbnail-item').forEach((item) => {
      const isCurrent = Number(item.dataset.page) === currentPage;
      item.classList.toggle('thumbnail-item--current', isCurrent);
      if (isCurrent) {
        item.setAttribute('aria-current', 'page');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.removeAttribute('aria-current');
      }
    });
  }, [currentPage]);

  useEffect(() => {
    let cancelled = false;
    const renderTasks: RenderTask[] = [];
    containerRef.current?.replaceChildren();
    setError(null);

    if (!pdfDoc) {
      return undefined;
    }
    const doc = pdfDoc;

    async function renderThumbnails() {
      try {
        for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
          if (cancelled) return;

          const page = await doc.getPage(pageNumber);
          if (cancelled) return;

          const viewport = page.getViewport({ scale: THUMBNAIL_SCALE });

          const canvas = document.createElement('canvas');
          canvas.className = 'thumbnail-canvas';
          // Device-pixel backing store; the CSS (`width: 100%`) sets the display size.
          const pixelRatio = Math.min(window.devicePixelRatio || 1, 3);
          canvas.width = Math.floor(viewport.width * pixelRatio);
          canvas.height = Math.floor(viewport.height * pixelRatio);

          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'thumbnail-item';
          item.dataset.testid = 'thumbnail-item';
          item.setAttribute('aria-label', `Go to page ${pageNumber}`);
          item.dataset.page = String(pageNumber);
          if (pageNumber === currentPageRef.current) {
            item.classList.add('thumbnail-item--current');
            item.setAttribute('aria-current', 'page');
          }
          item.appendChild(canvas);
          item.addEventListener('click', () => scrollToPage(pageNumber));
          containerRef.current?.appendChild(item);

          const renderTask = page.render({
            canvas,
            viewport,
            ...(pixelRatio !== 1 ? { transform: [pixelRatio, 0, 0, pixelRatio, 0, 0] } : {}),
          });
          renderTasks.push(renderTask);
          await renderTask.promise;
          if (cancelled) return;
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to render thumbnails');
      }
    }

    renderThumbnails();

    return () => {
      cancelled = true;
      renderTasks.forEach((task) => task.cancel());
      containerRef.current?.replaceChildren();
    };
  }, [pdfDoc]);

  return (
    <div className="thumbnails-panel" data-testid="thumbnails-panel">
      {error && (
        <div className="thumbnails-panel-error" role="alert">
          {error}
        </div>
      )}
      <div className="thumbnails-panel-items" ref={containerRef} />
    </div>
  );
}
