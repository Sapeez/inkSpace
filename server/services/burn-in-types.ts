// The client's annotation JSON is Fabric.js's own `canvas.toJSON(['annotationTool'])`
// shape (see AnnotationCanvas.jsx's `getAnnotationsForBurnIn`) — a per-object grab
// bag of whichever properties that object type serializes. This is intentionally
// loose (not a `Database`-style generated type) since it mirrors a third-party
// library's own serialization format, not our schema. Kept dependency-free
// (no `pdf-lib` import) so annotationGeometry.ts's pure coordinate math can be
// unit-tested without `pdf-lib` installed.
export interface AnnotationObjectJson {
  type: string;
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
  originX?: string;
  originY?: string;
  fill?: string | null;
  stroke?: string | null;
  strokeWidth?: number;
  opacity?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  points?: Array<{ x: number; y: number }>;
  path?: Array<Array<string | number>>;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  lineHeight?: number;
  src?: string;
}

export interface BurnInPage {
  pageNumber: number;
  objects: AnnotationObjectJson[];
}

export interface BurnInParams {
  attachmentId: string;
  pages: BurnInPage[];
}

export interface BurnInResult {
  filename: string;
  mimeType: string;
  pdfBase64: string;
}
