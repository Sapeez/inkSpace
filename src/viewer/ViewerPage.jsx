import Toolbar from '../toolbar/Toolbar.jsx';
import PDFViewer from './PDFViewer.tsx';
import AnnotationCanvas from '../annotation-canvas/AnnotationCanvas.jsx';
import { useParams } from 'react-router-dom';

export default function ViewerPage() {
  const { attachmentId } = useParams();

  return (
    <div className="viewer-layout">
      <Toolbar attachmentId={attachmentId} />
      <PDFViewer attachmentId={attachmentId} />
      <AnnotationCanvas attachmentId={attachmentId} />
    </div>
  );
}
