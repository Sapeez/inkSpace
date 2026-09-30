import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import ConfirmModal from './ConfirmModal.jsx';
import {
  deletePage,
  hasChanges,
  initialPages,
  insertAfter,
  movePage,
  pagesFromUpload,
  rotatePage,
} from '../viewer/documentEditModel';
import type { EditPage } from '../viewer/documentEditModel';
import { MAX_UPLOAD_BYTES, formatMegabytes } from '../utils/uploadLimits';

const THUMBNAIL_SCALE = 0.4;
const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

export interface DocumentEditResult {
  pages: EditPage[];
  // Bytes of each uploaded PDF, index i = source i + 1 in `pages`.
  uploads: Uint8Array[];
}

interface DocumentEditorModalProps {
  open: boolean;
  onClose: () => void;
  pdfDoc: PDFDocumentProxy | null;
  // 1-based page the user is on in the annotation view — the initially focused page.
  initialPage: number;
  // Applies the edit (server + viewer refresh). Reject with an Error to keep the
  // modal open and show its message.
  onSave: (result: DocumentEditResult) => Promise<void>;
  // Parses an uploaded PDF's bytes; injectable for tests.
  loadPdf?: (data: Uint8Array) => Promise<PDFDocumentProxy>;
}

async function defaultLoadPdf(data: Uint8Array): Promise<PDFDocumentProxy> {
  // Loaded on demand (the viewer has already configured pdf.js's worker), which
  // also keeps this module importable where pdf.js can't load (jsdom tests).
  const { getDocument } = await import('pdfjs-dist');
  // pdf.js takes ownership of the buffer it's given — hand it a copy.
  return getDocument({ data: data.slice() }).promise;
}

function startsWithPdfHeader(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, 1024);
  for (let i = 0; i + PDF_HEADER.length <= head.length; i += 1) {
    if (PDF_HEADER.every((byte, j) => head[i + j] === byte)) return true;
  }
  return false;
}

interface PageThumbnailProps {
  doc: PDFDocumentProxy;
  pageIndex: number;
  rotation: number;
}

// One page's preview. Rendered lazily (only once scrolled near view, where
// IntersectionObserver exists) so a long document doesn't rasterize every page up front.
function PageThumbnail({ doc, pageIndex, rotation }: PageThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (visible || !canvas) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
    }, { rootMargin: '300px' });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!visible || !canvas) return undefined;
    let cancelled = false;
    let task: RenderTask | null = null;

    (async () => {
      const page = await doc.getPage(pageIndex + 1);
      if (cancelled) return;
      const viewport = page.getViewport({ scale: THUMBNAIL_SCALE, rotation: (page.rotate + rotation) % 360 });
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.floor(viewport.width * pixelRatio);
      canvas.height = Math.floor(viewport.height * pixelRatio);
      canvas.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
      task = page.render({
        canvas,
        viewport,
        ...(pixelRatio !== 1 ? { transform: [pixelRatio, 0, 0, pixelRatio, 0, 0] } : {}),
      });
      await task.promise;
    })().catch(() => {
      /* a cancelled render (rotation changed mid-render) or an unrenderable page: leave the thumbnail blank */
    });

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageIndex, rotation, visible]);

  return <canvas ref={canvasRef} className="document-editor-canvas" />;
}

// Mounted only while open, so every opening starts from the file's current pages.
export default function DocumentEditorModal(props: DocumentEditorModalProps) {
  if (!props.open || !props.pdfDoc) return null;
  return <DocumentEditorContent {...props} pdfDoc={props.pdfDoc} />;
}

function DocumentEditorContent({
  onClose,
  pdfDoc,
  initialPage,
  onSave,
  loadPdf = defaultLoadPdf,
}: DocumentEditorModalProps & { pdfDoc: PDFDocumentProxy }) {
  const originalPageCount = pdfDoc.numPages;
  const [pages, setPages] = useState<EditPage[]>(() => initialPages(originalPageCount));
  const [focusKey, setFocusKey] = useState<string>(() => `0-${Math.min(Math.max(initialPage, 1), originalPageCount) - 1}`);
  const [uploads, setUploads] = useState<Uint8Array[]>([]);
  // source index -> parsed document; 0 is the file itself.
  const [sources, setSources] = useState<Map<number, PDFDocumentProxy>>(() => new Map([[0, pdfDoc]]));
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const focusIndex = Math.max(pages.findIndex((page) => page.key === focusKey), 0);
  const changed = useMemo(() => hasChanges(pages, originalPageCount), [pages, originalPageCount]);
  const uploadedBytes = uploads.reduce((total, bytes) => total + bytes.length, 0);

  // Esc = Cancel (no confirmation), except while a sub-dialog or a save is in flight.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !deleteConfirmOpen && !saving) onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [deleteConfirmOpen, saving, onClose]);

  // Keep the focused page in view (initially, and after an upload/move).
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>('.document-editor-page--current')
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [focusKey]);

  async function handleFilesChosen(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;

    setUploadError(null);
    const problems: string[] = [];
    let nextPages = pages;
    let nextUploads = uploads;
    let nextSources = new Map(sources);
    let insertAt = focusIndex;
    let firstInsertedKey: string | null = null;
    let runningBytes = uploadedBytes;

    for (const file of files) {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        problems.push(`${file.name}: only PDF files can be added`);
        continue;
      }
      if (file.size > MAX_UPLOAD_BYTES || runningBytes + file.size > MAX_UPLOAD_BYTES) {
        problems.push(`${file.name}: added files can total at most ${formatMegabytes(MAX_UPLOAD_BYTES)}`);
        continue;
      }
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!startsWithPdfHeader(bytes)) {
          problems.push(`${file.name}: only PDF files can be added`);
          continue;
        }
        const doc = await loadPdf(bytes);
        const source = nextUploads.length + 1;
        nextSources.set(source, doc);
        nextUploads = [...nextUploads, bytes];
        runningBytes += bytes.length;
        const inserted = pagesFromUpload(source, doc.numPages);
        nextPages = insertAfter(nextPages, insertAt, inserted);
        insertAt += inserted.length;
        firstInsertedKey ??= inserted[0]?.key ?? null;
      } catch {
        problems.push(`${file.name}: couldn't be read (is it password-protected or damaged?)`);
      }
    }

    setSources(nextSources);
    setUploads(nextUploads);
    setPages(nextPages);
    if (firstInsertedKey) setFocusKey(firstInsertedKey);
    if (problems.length > 0) setUploadError(problems.join('\n'));
  }

  function handleDrop(event: DragEvent<HTMLLIElement>, targetKey: string) {
    event.preventDefault();
    const movedKey = dragKey ?? event.dataTransfer.getData('text/plain');
    setDragKey(null);
    setDropKey(null);
    const from = pages.findIndex((page) => page.key === movedKey);
    const to = pages.findIndex((page) => page.key === targetKey);
    if (from < 0 || to < 0) return;
    setPages(movePage(pages, from, to));
    setFocusKey(movedKey);
  }

  function handleConfirmDelete() {
    const next = deletePage(pages, focusIndex);
    setPages(next);
    setFocusKey(next[Math.min(focusIndex, next.length - 1)]!.key);
    setDeleteConfirmOpen(false);
  }

  async function handleSave() {
    if (saving || !changed) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave({ pages, uploads });
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the document. Please try again.');
      setSaving(false);
    }
  }

  return (
    <>
      <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="document-editor-title" data-testid="document-editor-modal">
        <div className="document-editor">
          <header className="document-editor-header">
            <h2 id="document-editor-title" className="document-editor-title">Document editor</h2>
            <div className="document-editor-tools" role="toolbar" aria-label="Page tools">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                multiple
                hidden
                data-testid="document-editor-upload-input"
                onChange={handleFilesChosen}
              />
              <button type="button" className="document-editor-tool" data-testid="document-editor-upload" disabled={saving} onClick={() => fileInputRef.current?.click()}>
                Upload PDF
              </button>
              <button type="button" className="document-editor-tool" data-testid="document-editor-rotate-left" disabled={saving} onClick={() => setPages(rotatePage(pages, focusIndex, -90))}>
                Rotate left
              </button>
              <button type="button" className="document-editor-tool" data-testid="document-editor-rotate-right" disabled={saving} onClick={() => setPages(rotatePage(pages, focusIndex, 90))}>
                Rotate right
              </button>
              <button
                type="button"
                className="document-editor-tool document-editor-tool--danger"
                data-testid="document-editor-delete"
                disabled={saving || pages.length <= 1}
                onClick={() => setDeleteConfirmOpen(true)}
              >
                Delete page
              </button>
            </div>
          </header>

          {uploadError && (
            <p className="document-editor-error" role="alert" data-testid="document-editor-upload-error">
              {uploadError}
            </p>
          )}

          <ul className="document-editor-pages" ref={listRef} data-testid="document-editor-pages">
            {pages.map((page, index) => {
              const isCurrent = page.key === focusKey;
              const classes = [
                'document-editor-page',
                isCurrent ? 'document-editor-page--current' : '',
                dragKey === page.key ? 'document-editor-page--dragging' : '',
                dropKey === page.key && dragKey !== page.key ? 'document-editor-page--drop' : '',
              ].filter(Boolean).join(' ');
              return (
                <li
                  key={page.key}
                  className={classes}
                  data-testid="document-editor-page"
                  data-page-key={page.key}
                  draggable={!saving}
                  aria-current={isCurrent ? 'page' : undefined}
                  onClick={() => setFocusKey(page.key)}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', page.key);
                    setDragKey(page.key);
                  }}
                  onDragOver={(event) => {
                    if (!dragKey) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    setDropKey(page.key);
                  }}
                  onDragLeave={() => setDropKey((current) => (current === page.key ? null : current))}
                  onDrop={(event) => handleDrop(event, page.key)}
                  onDragEnd={() => {
                    setDragKey(null);
                    setDropKey(null);
                  }}
                >
                  <PageThumbnail doc={sources.get(page.source)!} pageIndex={page.pageIndex} rotation={page.rotation} />
                  <span className="document-editor-page-number">{index + 1}</span>
                </li>
              );
            })}
          </ul>

          {saveError && (
            <p className="document-editor-error" role="alert" data-testid="document-editor-save-error">
              {saveError}
            </p>
          )}

          <footer className="document-editor-footer">
            <button type="button" className="card-modal-button card-modal-button--secondary document-editor-footer-button" data-testid="document-editor-cancel" disabled={saving} onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="card-modal-button card-modal-button--primary document-editor-footer-button" data-testid="document-editor-save" disabled={saving || !changed} onClick={handleSave}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </footer>
        </div>
      </div>

      <ConfirmModal
        open={deleteConfirmOpen}
        variant="card"
        title="Delete page?"
        message="This page will be removed from the document."
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
        disabled={false}
        error={null}
        testId="document-editor-delete-modal"
        titleTestId="document-editor-delete-title"
        messageTestId="document-editor-delete-message"
        errorTestId="document-editor-delete-error"
        confirmTestId="document-editor-delete-confirm"
        cancelTestId="document-editor-delete-cancel"
      />
    </>
  );
}
