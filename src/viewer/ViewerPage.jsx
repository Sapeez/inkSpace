import { useRef } from 'react';
import Toolbar from '../toolbar/Toolbar.jsx';
import PDFViewer from './PDFViewer.tsx';
import ThumbnailPanel from './ThumbnailPanel.tsx';
import PageNavigator from './PageNavigator.tsx';
import AnnotationCanvas from '../annotation-canvas/AnnotationCanvas.jsx';
import { usePdfDocument } from './usePdfDocument.ts';
import { useParams } from 'react-router-dom';

export default function ViewerPage() {
  const { attachmentId } = useParams();
  const { pdfDoc, loading, error } = usePdfDocument(attachmentId);
  const annotationCanvasRef = useRef(null);

  return (
    <div className="viewer-layout">
      <Toolbar attachmentId={attachmentId} />
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
      <AnnotationCanvas ref={annotationCanvasRef} attachmentId={attachmentId} pdfDoc={pdfDoc} />
    </div>
  );
}
