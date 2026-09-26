import Toolbar from '../toolbar/Toolbar.jsx';
import PDFViewer from './PDFViewer.tsx';
import ThumbnailPanel from './ThumbnailPanel.tsx';
import AnnotationCanvas from '../annotation-canvas/AnnotationCanvas.jsx';
import { usePdfDocument } from './usePdfDocument.ts';
import { useParams } from 'react-router-dom';

export default function ViewerPage() {
  const { attachmentId } = useParams();
  const { pdfDoc, loading, error } = usePdfDocument(attachmentId);

  return (
    <div className="viewer-layout">
      <Toolbar attachmentId={attachmentId} />
      <div className="viewer-main">
        <ThumbnailPanel pdfDoc={pdfDoc} />
        <PDFViewer pdfDoc={pdfDoc} loading={loading} error={error} />
      </div>
      <AnnotationCanvas attachmentId={attachmentId} />
    </div>
  );
}
