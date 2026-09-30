import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import type { RGB } from 'pdf-lib';
import { downloadAttachmentBytes } from './storage.js';
import {
  boundingBoxTopLeft,
  buildTransformedPathString,
  buildTransformedPolygonString,
  flipY,
  makeLocalPointMapper,
  minOf,
  numericPointsIn,
} from './annotationGeometry.js';
import { decodeValidatedSignatureImage } from './signatureImageValidation.js';
import type { AnnotationObjectJson, BurnInParams, BurnInResult } from './burn-in-types.js';

export type { AnnotationObjectJson, BurnInPage, BurnInParams, BurnInResult } from './burn-in-types.js';

function hexToRgb(hex: string): RGB {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return rgb(r, g, b);
}

function drawRect(page: PDFPage, pageHeight: number, object: AnnotationObjectJson): void {
  const box = boundingBoxTopLeft(object);
  page.drawRectangle({
    x: box.x,
    y: flipY(box.y + box.height, pageHeight),
    width: box.width,
    height: box.height,
    color: object.fill ? hexToRgb(object.fill) : undefined,
    borderColor: object.stroke ? hexToRgb(object.stroke) : undefined,
    borderWidth: object.stroke ? object.strokeWidth ?? 1 : 0,
    opacity: object.opacity ?? 1,
    borderOpacity: object.opacity ?? 1,
  });
}

function drawEllipseShape(page: PDFPage, pageHeight: number, object: AnnotationObjectJson): void {
  const box = boundingBoxTopLeft(object);
  const centerX = box.x + box.width / 2;
  const centerY = flipY(box.y + box.height / 2, pageHeight);
  page.drawEllipse({
    x: centerX,
    y: centerY,
    xScale: box.width / 2,
    yScale: box.height / 2,
    color: object.fill ? hexToRgb(object.fill) : undefined,
    borderColor: object.stroke ? hexToRgb(object.stroke) : undefined,
    borderWidth: object.stroke ? object.strokeWidth ?? 1 : 0,
    opacity: object.opacity ?? 1,
    borderOpacity: object.opacity ?? 1,
  });
}

function drawLineShape(page: PDFPage, pageHeight: number, object: AnnotationObjectJson): void {
  const x1 = object.x1 ?? 0;
  const y1 = object.y1 ?? 0;
  const x2 = object.x2 ?? 0;
  const y2 = object.y2 ?? 0;
  const box = boundingBoxTopLeft(object);
  const mapPoint = makeLocalPointMapper(minOf([x1, x2]), minOf([y1, y2]), box, object);
  const start = mapPoint({ x: x1, y: y1 });
  const end = mapPoint({ x: x2, y: y2 });
  page.drawLine({
    start: { x: start.x, y: flipY(start.y, pageHeight) },
    end: { x: end.x, y: flipY(end.y, pageHeight) },
    thickness: object.strokeWidth ?? 1,
    color: object.stroke ? hexToRgb(object.stroke) : rgb(0, 0, 0),
    opacity: object.opacity ?? 1,
  });
}

// Arrow/Cloud/pen-and-highlighter strokes are all Fabric `Path` objects.
// Fabric normalizes whatever SVG-style path string they were built from
// (M/L/A for Arrow and Cloud — see AnnotationCanvas.jsx's `buildArrowPath`/
// `buildCloudPathData`) into an absolute, arc-free command list (M/L/C/Q/Z)
// at parse time — pdf-lib's own SVG path support draws that same command set
// natively, so this rebuilds an equivalent path string rather than
// reimplementing curve/arc math.
//
// Unlike drawRectangle/drawEllipse/drawLine/drawText/drawImage (which all take
// coordinates directly in the page's own y-up space, so `flipY` is applied
// once, here, before calling them), `drawSvgPath` does its OWN y-flip
// internally — it applies `concatTransformationMatrix(scale, 0, 0, -scale, x,
// y)` to the path data it's given, i.e. it expects **y-down** input (Canvas/
// SVG convention) and flips it relative to the `y` option itself. Fabric's
// own coordinates are already y-down (see this file's header comment), so the
// mapped points below are passed straight through, unflipped — flipping them
// here too would flip twice, rendering these shapes vertically mirrored and
// off-page. `y: pageHeight` is the anchor that makes "0" in the path's own
// y-down space land at the page's top edge.
function drawPathShape(page: PDFPage, pageHeight: number, object: AnnotationObjectJson): void {
  const path = object.path ?? [];
  const rawPoints = numericPointsIn(path);
  const rawMinX = minOf(rawPoints.map((p) => p.x));
  const rawMinY = minOf(rawPoints.map((p) => p.y));
  const box = boundingBoxTopLeft(object);
  const mapPoint = makeLocalPointMapper(rawMinX, rawMinY, box, object);

  const svgPath = buildTransformedPathString(path, mapPoint);

  page.drawSvgPath(svgPath, {
    x: 0,
    y: pageHeight,
    scale: 1,
    color: object.fill ? hexToRgb(object.fill) : undefined,
    borderColor: object.stroke ? hexToRgb(object.stroke) : undefined,
    borderWidth: object.stroke ? object.strokeWidth ?? 1 : 0,
    opacity: object.opacity ?? 1,
    borderOpacity: object.opacity ?? 1,
  });
}

// See `drawPathShape`'s comment — same "drawSvgPath flips y itself" reasoning
// applies here, so `mapPoint`'s output (canvas-space, y-down) is passed
// through unflipped.
function drawPolygonShape(page: PDFPage, pageHeight: number, object: AnnotationObjectJson): void {
  const rawPoints = object.points ?? [];
  if (rawPoints.length === 0) return;
  const rawMinX = minOf(rawPoints.map((p) => p.x));
  const rawMinY = minOf(rawPoints.map((p) => p.y));
  const box = boundingBoxTopLeft(object);
  const mapPoint = makeLocalPointMapper(rawMinX, rawMinY, box, object);

  const svgPath = buildTransformedPolygonString(rawPoints, mapPoint);

  page.drawSvgPath(svgPath, {
    x: 0,
    y: pageHeight,
    scale: 1,
    color: object.fill ? hexToRgb(object.fill) : undefined,
    borderColor: object.stroke ? hexToRgb(object.stroke) : undefined,
    borderWidth: object.stroke ? object.strokeWidth ?? 1 : 0,
    opacity: object.opacity ?? 1,
    borderOpacity: object.opacity ?? 1,
  });
}

// Textbox word-wrap: Fabric computes its own wrapped lines client-side
// (`textLines`, not part of the JSON this file receives — only the raw
// `text` and the box's wrap `width` are), so this re-wraps using the same
// greedy strategy against the embedded font's real metrics, rather than
// drawing the raw (unwrapped) string and letting it run off the page.
function wrapTextToWidth(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    const words = paragraph.split(' ');
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && font.widthOfTextAtSize(candidate, fontSize) > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    lines.push(current);
  }
  return lines;
}

type FontFamilyKey = 'helvetica' | 'times' | 'courier';

// Canvas `fontFamily` values the Text tool offers (StyleControls.tsx
// FONT_OPTIONS) → the PDF standard font that stands in for them. Anything
// else (e.g. a missing fontFamily) falls back to Helvetica.
function fontFamilyKey(fontFamily: string | undefined): FontFamilyKey {
  const name = (fontFamily ?? '').toLowerCase();
  if (name.includes('times')) return 'times';
  if (name.includes('courier')) return 'courier';
  return 'helvetica';
}

const STANDARD_FONTS: Record<FontFamilyKey, StandardFonts> = {
  helvetica: StandardFonts.Helvetica,
  times: StandardFonts.TimesRoman,
  courier: StandardFonts.Courier,
};

type FontResolver = (fontFamily: string | undefined) => PDFFont;

function drawTextbox(page: PDFPage, pageHeight: number, object: AnnotationObjectJson, font: PDFFont): void {
  const box = boundingBoxTopLeft(object);
  const fontSize = (object.fontSize ?? 16) * (object.scaleY ?? 1);
  const lineHeight = fontSize * (object.lineHeight ?? 1.16);
  const lines = wrapTextToWidth(object.text ?? '', font, fontSize, box.width);
  const color = object.fill ? hexToRgb(object.fill) : rgb(0, 0, 0);

  lines.forEach((line, index) => {
    const baselineCanvasY = box.y + fontSize + index * lineHeight;
    page.drawText(line, {
      x: box.x,
      y: flipY(baselineCanvasY, pageHeight),
      size: fontSize,
      font,
      color,
      opacity: object.opacity ?? 1,
    });
  });
}

// Signature images (SignatureUploader.tsx) are always re-encoded through a
// `<canvas>.toDataURL()` before being placed (no args → PNG), so `src` is
// always a `data:image/png;base64,...` URL regardless of the originally
// uploaded file's type — one embed path covers every signature. Validation
// (task 5.3/5.6, R8: reject an oversized or disguised image before it's ever
// decoded) lives in `signatureImageValidation.ts`, dependency-free so it's
// unit-testable independent of whether `pdf-lib` happens to be installed —
// see that file's own comment.
async function drawImageShape(
  pdfDoc: PDFDocument,
  page: PDFPage,
  pageHeight: number,
  object: AnnotationObjectJson,
): Promise<void> {
  if (!object.src) return;
  const bytes = decodeValidatedSignatureImage(object.src);
  const image = await pdfDoc.embedPng(bytes);
  const box = boundingBoxTopLeft(object);
  page.drawImage(image, {
    x: box.x,
    y: flipY(box.y + box.height, pageHeight),
    width: box.width,
    height: box.height,
    opacity: object.opacity ?? 1,
  });
}

async function drawAnnotationObject(
  pdfDoc: PDFDocument,
  page: PDFPage,
  pageHeight: number,
  resolveFont: FontResolver,
  object: AnnotationObjectJson,
): Promise<void> {
  switch (object.type) {
    case 'rect':
      drawRect(page, pageHeight, object);
      return;
    case 'ellipse':
      drawEllipseShape(page, pageHeight, object);
      return;
    case 'line':
      drawLineShape(page, pageHeight, object);
      return;
    case 'path':
      drawPathShape(page, pageHeight, object);
      return;
    case 'polygon':
      drawPolygonShape(page, pageHeight, object);
      return;
    case 'textbox':
    case 'i-text':
    case 'text':
      drawTextbox(page, pageHeight, object, resolveFont(object.fontFamily));
      return;
    case 'image':
      await drawImageShape(pdfDoc, page, pageHeight, object);
      return;
    default:
      // Unknown/incomplete object (e.g. a future tool this file hasn't been
      // taught yet) — skip rather than fail the whole burn-in over one object.
      return;
  }
}

// S3/R4: burns every annotation into a *copy* of the original PDF's bytes —
// the original attachment/its Storage object are never written to. Returns
// the burned PDF as base64 so the route can either stream it straight back
// for Download (D1-D3) or forward it, unmodified, to the save endpoint
// (task 3.3) — the same burn-in result serves both flows.
export async function applyBurnIn({ attachmentId, pages }: BurnInParams): Promise<BurnInResult> {
  const { filename, bytes } = await downloadAttachmentBytes(attachmentId);
  const pdfDoc = await PDFDocument.load(bytes);
  const embedded = new Map<FontFamilyKey, PDFFont>();
  for (const key of Object.keys(STANDARD_FONTS) as FontFamilyKey[]) {
    embedded.set(key, await pdfDoc.embedFont(STANDARD_FONTS[key]));
  }
  const resolveFont: FontResolver = (fontFamily) => embedded.get(fontFamilyKey(fontFamily))!;
  const pageCount = pdfDoc.getPageCount();

  for (const { pageNumber, objects } of pages) {
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) {
      throw Object.assign(new Error(`Annotation references page ${pageNumber}, outside 1..${pageCount}`), {
        status: 400,
      });
    }
    const page = pdfDoc.getPage(pageNumber - 1);
    const pageHeight = page.getHeight();
    for (const object of objects) {
      await drawAnnotationObject(pdfDoc, page, pageHeight, resolveFont, object);
    }
  }

  const outputBytes = await pdfDoc.save();
  return {
    filename,
    mimeType: 'application/pdf',
    pdfBase64: Buffer.from(outputBytes).toString('base64'),
  };
}
