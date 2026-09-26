import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

interface PDFViewerProps {
  pdfDoc: PDFDocumentProxy | null;
  loading: boolean;
  error: string | null;
}

export default function PDFViewer({ pdfDoc, loading: documentLoading, error: documentError }: PDFViewerProps) {
  const pagesContainerRef = useRef<HTMLDivElement>(null);
  const [rendering, setRendering] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const renderTasks: RenderTask[] = [];
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

          const viewport = page.getViewport({ scale: 1 });

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

        if (!cancelled) setRendering(false);
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
      pagesContainerRef.current?.replaceChildren();
    };
  }, [pdfDoc]);

  const loading = documentLoading || (pdfDoc !== null && rendering);
  const error = documentError ?? renderError;

  return (
    <div className="pdf-viewer" data-testid="pdf-viewer">
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
  );
}
