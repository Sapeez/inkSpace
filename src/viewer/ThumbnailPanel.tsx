import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { scrollToPage } from './viewerPageTracking';

const THUMBNAIL_SCALE = 0.2;

interface ThumbnailPanelProps {
  pdfDoc: PDFDocumentProxy | null;
}

export default function ThumbnailPanel({ pdfDoc }: ThumbnailPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

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
          canvas.width = viewport.width;
          canvas.height = viewport.height;

          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'thumbnail-item';
          item.dataset.testid = 'thumbnail-item';
          item.setAttribute('aria-label', `Go to page ${pageNumber}`);
          item.appendChild(canvas);
          item.addEventListener('click', () => scrollToPage(pageNumber));
          containerRef.current?.appendChild(item);

          const renderTask = page.render({ canvas, viewport });
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
