import { useEffect, useRef, useState } from 'react';
import type { RenderTask } from 'pdfjs-dist';
import { fetchAttachment } from '../lib/index.js';

const THUMBNAIL_SCALE = 0.3;

// The `?url` suffix is a Vite-only asset-import convention (resolves to the
// built worker file's URL) — it has no meaning to plain Node ESM resolution,
// which instead tries to load `pdf.worker.mjs` itself as a module and fails
// (`does not provide an export named 'default'`). Deferred to a dynamic
// import inside the render effect's own `try`/`catch` (below), the same
// place a real "can't load this PDF" failure is already handled, rather
// than a static top-level import that would crash every test importing this
// component (directly or via RecentSection.tsx) regardless of
// whether it ever renders a real thumbnail. `usePdfDocument.ts` doesn't need
// this treatment: no test imports it (PDFViewer.test.tsx injects an
// already-loaded `pdfDoc` instead), so it's never hit this under `node --test`.
let workerConfigured = false;
async function configurePdfWorker(): Promise<void> {
  if (workerConfigured) return;
  const [{ GlobalWorkerOptions }, workerModule] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.mjs?url'),
  ]);
  GlobalWorkerOptions.workerSrc = (workerModule as { default: string }).default;
  workerConfigured = true;
}

interface FileThumbnailProps {
  attachmentId: string;
}

interface AttachmentDownload {
  url: string;
}

function isAttachmentDownload(value: unknown): value is AttachmentDownload {
  return typeof value === 'object' && value !== null && typeof (value as { url?: unknown }).url === 'string';
}

// WF6/WF9: a rendered first-page thumbnail per file card — this fetches the
// attachment's own signed URL and renders just page 1, independently of
// (and much cheaper than) the full viewer's `usePdfDocument`/`PDFViewer.tsx`,
// which load every page. Known simplification, not required by this task's
// relevant-files list: a workspace with many files renders one small pdf.js
// document per visible card with no shared virtualization/caching across
// cards — acceptable at today's scale, revisit if a real workspace's file
// count makes this a measured problem (the viewer's own `PDFViewer.tsx`
// virtualization, task 5.2 of tasks-pdf-editor.md, is the precedent to
// follow if so).
export default function FileThumbnail({ attachmentId }: FileThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let renderTask: RenderTask | null = null;
    setFailed(false);

    async function render() {
      try {
        await configurePdfWorker();
        const { getDocument } = await import('pdfjs-dist');
        const fetched: unknown = await fetchAttachment(attachmentId);
        if (!isAttachmentDownload(fetched)) throw new Error('Malformed attachment response');
        if (cancelled) return;

        const doc = await getDocument(fetched.url).promise;
        if (cancelled) {
          void doc.destroy();
          return;
        }

        const page = await doc.getPage(1);
        if (cancelled) {
          void doc.destroy();
          return;
        }

        const viewport = page.getViewport({ scale: THUMBNAIL_SCALE });
        const canvas = canvasRef.current;
        if (!canvas) {
          void doc.destroy();
          return;
        }
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        renderTask = page.render({ canvas, viewport });
        await renderTask.promise;
        void doc.destroy();
      } catch (err) {
        if (!cancelled) setFailed(true);
      }
    }

    render();

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [attachmentId]);

  if (failed) {
    return <div className="file-thumbnail file-thumbnail--fallback" data-testid="file-thumbnail" aria-hidden="true" />;
  }

  return <canvas ref={canvasRef} className="file-thumbnail" data-testid="file-thumbnail" />;
}
