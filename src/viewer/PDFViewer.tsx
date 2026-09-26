import { useEffect, useRef, useState } from 'react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { fetchAttachment } from '../lib/index.js';

GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

// Mirrors AttachmentDownload in server/services/storage.ts until the client and
// server share generated types (typescript-standard.md §2.7).
interface AttachmentDownload {
  id: string;
  filename: string;
  mimeType: string;
  pageCount: number | null;
  url: string;
}

function isAttachmentDownload(value: unknown): value is AttachmentDownload {
  return typeof value === 'object' && value !== null && typeof (value as { url?: unknown }).url === 'string';
}

interface PDFViewerProps {
  attachmentId: string;
}

export default function PDFViewer({ attachmentId }: PDFViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let pdfDoc: PDFDocumentProxy | null = null;
    let renderTask: RenderTask | null = null;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const attachment: unknown = await fetchAttachment(attachmentId);
        if (!isAttachmentDownload(attachment)) {
          throw new Error('Malformed attachment response');
        }
        if (cancelled) return;

        pdfDoc = await getDocument(attachment.url).promise;
        if (cancelled) return;

        const page = await pdfDoc.getPage(1);
        if (cancelled) return;

        const viewport = page.getViewport({ scale: 1 });
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        renderTask = page.render({ canvas, viewport });
        await renderTask.promise;
        if (cancelled) return;

        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load document');
        setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
      renderTask?.cancel();
      void pdfDoc?.destroy();
    };
  }, [attachmentId]);

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
      <canvas ref={canvasRef} className="pdf-viewer-canvas" />
    </div>
  );
}
