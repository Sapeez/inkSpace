import { useEffect, useState } from 'react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
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

interface UsePdfDocumentResult {
  pdfDoc: PDFDocumentProxy | null;
  loading: boolean;
  error: string | null;
}

export function usePdfDocument(attachmentId: string): UsePdfDocumentResult {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let doc: PDFDocumentProxy | null = null;

    setLoading(true);
    setError(null);
    setPdfDoc(null);

    async function load() {
      try {
        const attachment: unknown = await fetchAttachment(attachmentId);
        if (!isAttachmentDownload(attachment)) {
          throw new Error('Malformed attachment response');
        }
        if (cancelled) return;

        doc = await getDocument(attachment.url).promise;
        if (cancelled) {
          void doc.destroy();
          return;
        }

        setPdfDoc(doc);
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
      void doc?.destroy();
    };
  }, [attachmentId]);

  return { pdfDoc, loading, error };
}
