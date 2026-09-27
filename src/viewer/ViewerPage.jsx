import { useRef, useState } from 'react';
import Toolbar from '../toolbar/Toolbar.jsx';
import PDFViewer from './PDFViewer.tsx';
import ThumbnailPanel from './ThumbnailPanel.tsx';
import PageNavigator from './PageNavigator.tsx';
import AnnotationCanvas from '../annotation-canvas/AnnotationCanvas.jsx';
import ConfirmModal from '../modals/ConfirmModal.jsx';
import SaveModal from '../modals/SaveModal.tsx';
import { usePdfDocument } from './usePdfDocument.ts';
import { DEFAULT_ANNOTATION_STYLE } from '../toolbar/StyleControls.tsx';
import { burnInAttachment } from '../lib/index.js';
import { useParams } from 'react-router-dom';

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
  const { pdfDoc, loading, error, attachment } = usePdfDocument(attachmentId);
  const annotationCanvasRef = useRef(null);
  const [activeTool, setActiveTool] = useState('pen');
  const [style, setStyle] = useState(DEFAULT_ANNOTATION_STYLE);
  // A6: owned here, not inside AnnotationCanvas.jsx, since the modal itself
  // (exact-text confirmation) is UI, and AnnotationCanvas.jsx renders
  // nothing of its own (see its trailing comment) — it only requests that
  // this open, via `onRequestDelete`.
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(null);

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

  return (
    <div className="viewer-layout">
      <Toolbar
        attachmentId={attachmentId}
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
      />
      <div className="viewer-main">
        <ThumbnailPanel pdfDoc={pdfDoc} />
        <div className="pdf-viewer-region">
          <PDFViewer
            pdfDoc={pdfDoc}
            loading={loading}
            error={error}
            onPageRendered={(pageNumber, pageWrapper, pdfCanvasEl) =>
              annotationCanvasRef.current?.handlePageRendered(pageNumber, pageWrapper, pdfCanvasEl)
            }
            onPagesReset={() => annotationCanvasRef.current?.handlePagesReset()}
          />
          <PageNavigator pdfDoc={pdfDoc} />
        </div>
      </div>
      <AnnotationCanvas
        ref={annotationCanvasRef}
        attachmentId={attachmentId}
        pdfDoc={pdfDoc}
        activeTool={activeTool}
        style={style}
        onRequestDelete={() => setDeleteConfirmOpen(true)}
      />
      <ConfirmModal
        open={deleteConfirmOpen}
        title="Delete annotation?"
        message="Are you sure you want to delete this annotation?"
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
