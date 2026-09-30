import { useCallback, useEffect, useRef, useState } from 'react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { fetchAttachment } from '../lib/index.js';

GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

// Mirrors AttachmentDownload in server/services/storage.ts until the client and
// server share generated types (typescript-standard.md §2.7). 7.3/7.4:
// single-owner model — anyone who can reach a file at all is its owner, so
// there's no per-caller role left to carry here.
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
  // Fetches the file again (e.g. after the Document editor changed its pages) and
  // swaps the new document in without an empty/loading flash in between.
  reload: () => Promise<void>;
}

export function usePdfDocument(attachmentId: string): UsePdfDocumentResult {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<AttachmentDownload | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  // The document currently shown — kept in a ref so `reload()` can replace it and
  // the effect's cleanup still destroys whichever one is live.
  const docRef = useRef<PDFDocumentProxy | null>(null);

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

        docRef.current = doc;
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
      void docRef.current?.destroy();
      if (docRef.current !== doc) void doc?.destroy();
      docRef.current = null;
    };
  }, [attachmentId]);

  const reload = useCallback(async () => {
    const fetched: unknown = await fetchAttachment(attachmentId);
    if (!isAttachmentDownload(fetched)) throw new Error('Malformed attachment response');
    const next = await getDocument(fetched.url).promise;
    const previous = docRef.current;
    docRef.current = next;
    setAttachment(fetched);
    setPdfDoc(next);
    // The viewer is still tearing the old pages down as this swap commits.
    if (previous) window.setTimeout(() => void previous.destroy(), 2000);
  }, [attachmentId]);

  return { pdfDoc, loading, error, attachment, accessDenied, reload };
}
