import { useRef, useState } from 'react';
import Toolbar from '../toolbar/Toolbar.jsx';
import PDFViewer from './PDFViewer.tsx';
import ThumbnailPanel from './ThumbnailPanel.tsx';
import PageNavigator from './PageNavigator.tsx';
import NoAccessState from './NoAccessState.tsx';
import AnnotationCanvas from '../annotation-canvas/AnnotationCanvas.jsx';
import TextMarkupToolbar from '../annotation-canvas/TextMarkupToolbar.tsx';
import ConfirmModal from '../modals/ConfirmModal.jsx';
import SaveModal from '../modals/SaveModal.tsx';
import DocumentEditorModal from '../modals/DocumentEditorModal.tsx';
import { usePdfDocument } from './usePdfDocument.ts';
import { useAnnotationDraft } from './useAnnotationDraft.ts';
import { DEFAULT_ANNOTATION_STYLE } from '../toolbar/StyleControls.tsx';
import { burnInAttachment, editDocumentPages } from '../lib/index.js';
import { bytesToBase64 } from '../utils/base64.ts';
import { getMostVisiblePageNumber } from './viewerPageTracking.ts';
import { toAnnotationMapping, toPageSpecs } from './documentEditModel.ts';
import { useNavigate, useParams } from 'react-router-dom';

// D2/D3: decodes the burn-in endpoint's base64 PDF into a real download —
// same base64-JSON contract SaveModal.tsx's save flow reuses (see
// src/lib/create.js's `burnInAttachment` comment for why burn-in returns
// JSON instead of a binary response).
function downloadBase64Pdf(base64, filename) {
  const byteString = atob(base64);
  const bytes = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i += 1) {
    bytes[i] = byteString.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ViewerPage() {
  const { attachmentId } = useParams();
  const { pdfDoc, loading, error, attachment, accessDenied, reload } = usePdfDocument(attachmentId);
  const annotationCanvasRef = useRef(null);
  const [activeTool, setActiveTool] = useState('pen');
  // Each tool keeps its own color/stroke width; switching tools never
  // overrides another tool's configuration.
  const [stylesByTool, setStylesByTool] = useState({});
  const style = stylesByTool[activeTool] ?? DEFAULT_ANNOTATION_STYLE;
  const setStyle = (next) => setStylesByTool((prev) => ({ ...prev, [activeTool]: next }));
  const navigate = useNavigate();
  // A6: owned here, not inside AnnotationCanvas.jsx, since the modal itself
  // (exact-text confirmation) is UI, and AnnotationCanvas.jsx renders
  // nothing of its own (see its trailing comment) — it only requests that
  // this open, via `onRequestDelete`.
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(null);
  // Annotations autosave to the server as a draft (and restore on open), so
  // work survives closing the tab or switching computers without Save/Download.
  const draft = useAnnotationDraft({ attachmentId, ready: pdfDoc !== null, canvasRef: annotationCanvasRef });
  const [leaveWarningOpen, setLeaveWarningOpen] = useState(false);
  const [documentEditorOpen, setDocumentEditorOpen] = useState(false);
  const [documentEditorPage, setDocumentEditorPage] = useState(1);

  // The editor opens focused on whichever page the annotation view is showing.
  function openDocumentEditor() {
    const container = document.querySelector('.pdf-viewer');
    setDocumentEditorPage((container && getMostVisiblePageNumber(container)) || 1);
    setDocumentEditorOpen(true);
  }

  // Applies a Document-editor edit: rewrite the file's pages on the server, move
  // each page's annotations (and its draft) to where the page went, then show the
  // new document. Throws to keep the editor open if the server edit fails.
  async function handleDocumentEdit({ pages, uploads }) {
    await editDocumentPages(attachmentId, { uploads: uploads.map(bytesToBase64), pages: toPageSpecs(pages) });
    try {
      await annotationCanvasRef.current?.applyDocumentEdit(toAnnotationMapping(pages));
      draft.notifyChange();
      await draft.flush();
      await reload();
    } catch {
      throw new Error('The document was saved, but the view could not be refreshed. Reload the page to see it.');
    }
  }

  async function handleBack() {
    if (await draft.flush()) navigate('/workspace');
    else setLeaveWarningOpen(true);
  }

  // D1-D3: burns the current annotations into a copy of the original PDF
  // and downloads it under the *original* filename (D3) — never the save
  // flow's renamed/timestamped one, since Download never creates a new
  // attachment (S1-S9 is the only flow that does).
  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const pages = annotationCanvasRef.current?.getAnnotationsForBurnIn() ?? [];
      const burned = await burnInAttachment(attachmentId, pages);
      downloadBase64Pdf(burned.pdfBase64, burned.filename);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Failed to download');
    } finally {
      setDownloading(false);
    }
  }

  // P5: no viewer chrome at all when the attachment fetch was 401/403/404 —
  // never a blank screen, and never the toolbar/canvas underneath a
  // generic error string.
  if (accessDenied) {
    return <NoAccessState />;
  }

  return (
    <div className="viewer-layout">
      <Toolbar
        attachmentName={attachment?.filename ?? ''}
        onBack={handleBack}
        draftStatus={draft.status}
        activeTool={activeTool}
        onToolChange={setActiveTool}
        style={style}
        onStyleChange={setStyle}
        onSignaturePlace={({ source, naturalWidth, naturalHeight }) =>
          annotationCanvasRef.current?.addSignatureImage(source, naturalWidth, naturalHeight) ?? false
        }
        onDownload={handleDownload}
        downloading={downloading}
        downloadError={downloadError}
        onSaveClick={() => setSaveModalOpen(true)}
        onDocumentEditor={openDocumentEditor}
      />
      <div className="viewer-main">
        <ThumbnailPanel pdfDoc={pdfDoc} />
        <div className="pdf-viewer-region">
          <PDFViewer
            pdfDoc={pdfDoc}
            loading={loading}
            error={error}
            textLayer
            onPageRendered={(pageNumber, pageWrapper, pdfCanvasEl) =>
              annotationCanvasRef.current?.handlePageRendered(pageNumber, pageWrapper, pdfCanvasEl)
            }
            onPagesReset={() => annotationCanvasRef.current?.handlePagesReset()}
          />
          <PageNavigator pdfDoc={pdfDoc} />
          <TextMarkupToolbar onApply={(kind, rects) => annotationCanvasRef.current?.addTextMarkup(kind, rects)} />
        </div>
      </div>
      <AnnotationCanvas
        ref={annotationCanvasRef}
        attachmentId={attachmentId}
        pdfDoc={pdfDoc}
        activeTool={activeTool}
        style={style}
        onRequestDelete={() => setDeleteConfirmOpen(true)}
        onObjectCreated={() => setActiveTool('hand')}
        onChange={draft.notifyChange}
      />
      <ConfirmModal
        open={deleteConfirmOpen}
        title="Delete annotation?"
        message="Are you sure you want to delete this annotation?"
        variant="card"
        confirmLabel="Delete"
        onConfirm={() => {
          annotationCanvasRef.current?.deleteActiveObject();
          setDeleteConfirmOpen(false);
        }}
        onCancel={() => setDeleteConfirmOpen(false)}
        testId="delete-confirm-modal"
        titleTestId="delete-confirm-title"
        messageTestId="delete-confirm-message"
        confirmTestId="delete-confirm-button"
        cancelTestId="delete-cancel-button"
      />
      <ConfirmModal
        open={leaveWarningOpen}
        variant="card"
        title="Go back?"
        message="Your latest changes couldn't be saved to the server. They're kept in this browser, but may be lost if you clear it. Go back anyway?"
        confirmLabel="Go back"
        onConfirm={() => navigate('/workspace')}
        onCancel={() => setLeaveWarningOpen(false)}
        testId="back-confirm-modal"
        confirmTestId="back-confirm-button"
        cancelTestId="back-cancel-button"
      />
      <DocumentEditorModal
        open={documentEditorOpen}
        pdfDoc={pdfDoc}
        initialPage={documentEditorPage}
        onClose={() => setDocumentEditorOpen(false)}
        onSave={handleDocumentEdit}
      />
      <SaveModal
        open={saveModalOpen}
        attachmentId={attachmentId}
        originalFilename={attachment?.filename ?? ''}
        onClose={() => setSaveModalOpen(false)}
        getAnnotations={() => annotationCanvasRef.current?.getAnnotationsForBurnIn() ?? []}
      />
    </div>
  );
}
