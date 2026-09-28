import { useEffect, useState } from 'react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { fetchAttachment } from '../lib/index.js';

GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

// Mirrors AttachmentDownload in server/services/storage.ts until the client and
// server share generated types (typescript-standard.md §2.7). `role` (P3/P4)
// is added by attachments.js's GET /:id handler, not by downloadAttachment
// itself — see server/routes/attachments.js.
export type AttachmentRole = 'owner' | 'edit' | 'view';

interface AttachmentDownload {
  id: string;
  filename: string;
  mimeType: string;
  pageCount: number | null;
  url: string;
  role: AttachmentRole;
}

function isAttachmentDownload(value: unknown): value is AttachmentDownload {
  return typeof value === 'object' && value !== null && typeof (value as { url?: unknown }).url === 'string';
}

interface RequestError extends Error {
  status?: number;
}

function isRequestError(value: unknown): value is RequestError {
  return value instanceof Error;
}

interface UsePdfDocumentResult {
  pdfDoc: PDFDocumentProxy | null;
  loading: boolean;
  error: string | null;
  // D3/S2: Download and the Save modal's filename pre-fill both need the
  // original attachment's filename — surfaced here since this hook is
  // already the one place that fetches that metadata, rather than having
  // ViewerPage.jsx re-fetch it separately.
  attachment: AttachmentDownload | null;
  // P5: true when the fetch failed with 401/403/404 — ViewerPage.jsx renders
  // NoAccessState.tsx instead of the viewer chrome in that case, rather than
  // showing this hook's generic `error` string inside the normal layout.
  accessDenied: boolean;
}

export function usePdfDocument(attachmentId: string): UsePdfDocumentResult {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<AttachmentDownload | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;

    setLoading(true);
    setError(null);
    setPdfDoc(null);
    setAttachment(null);
    setAccessDenied(false);

    async function load() {
      try {
        const fetched: unknown = await fetchAttachment(attachmentId);
        if (!isAttachmentDownload(fetched)) {
          throw new Error('Malformed attachment response');
        }
        if (cancelled) return;
        setAttachment(fetched);

        doc = await getDocument(fetched.url).promise;
        if (cancelled) {
          void doc.destroy();
          return;
        }

        setPdfDoc(doc);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        if (isRequestError(err) && (err.status === 401 || err.status === 403 || err.status === 404)) {
          setAccessDenied(true);
        }
        setError(err instanceof Error ? err.message : 'Failed to load document');
        setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
      void doc?.destroy();
    };
  }, [attachmentId]);

  return { pdfDoc, loading, error, attachment, accessDenied };
}
