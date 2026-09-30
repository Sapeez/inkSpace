import { PDFDocument, degrees } from 'pdf-lib';
import { MAX_UPLOAD_BYTES, formatMegabytes } from '../../src/utils/uploadLimits.js';

// One page of the edited document, in final order. `source` 0 is the file being
// edited; 1..n index into the uploaded PDFs sent alongside. `rotate` is the
// *extra* clockwise rotation (0/90/180/270) on top of whatever the source page
// already had.
export interface PageSpec {
  source: number;
  pageIndex: number;
  rotate: number;
}

function httpError(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

function looksLikePdf(bytes: Uint8Array): boolean {
  // The header may be preceded by a little junk; real-world PDFs keep it in the first 1 KB.
  const head = bytes.subarray(0, 1024);
  for (let i = 0; i + PDF_MAGIC.length <= head.length; i += 1) {
    if (PDF_MAGIC.every((byte, j) => head[i + j] === byte)) return true;
  }
  return false;
}

// Dependency-free shape check (no PDF parsing) — returns the error message or null.
export function validatePageSpecs(pages: unknown, sourceCount: number): string | null {
  if (!Array.isArray(pages) || pages.length === 0) return 'pages must be a non-empty array';
  for (const page of pages) {
    if (typeof page !== 'object' || page === null) return 'each page must be an object';
    const { source, pageIndex, rotate } = page as Record<string, unknown>;
    if (!Number.isInteger(source) || (source as number) < 0 || (source as number) > sourceCount) {
      return 'page source is out of range';
    }
    if (!Number.isInteger(pageIndex) || (pageIndex as number) < 0) return 'pageIndex must be a non-negative integer';
    if (![0, 90, 180, 270].includes(rotate as number)) return 'rotate must be 0, 90, 180 or 270';
  }
  return null;
}

// Builds the edited PDF: pages copied from the original and the uploads in the
// requested order, each with its rotation applied. Pure bytes-in/bytes-out so it
// can be tested without Supabase.
export async function applyPageEdits(
  originalBytes: Uint8Array,
  uploads: Uint8Array[],
  pages: PageSpec[],
): Promise<Uint8Array> {
  const specError = validatePageSpecs(pages, uploads.length);
  if (specError) throw httpError(specError, 400);

  const sources: PDFDocument[] = [];
  for (const [index, bytes] of [originalBytes, ...uploads].entries()) {
    if (index > 0 && !looksLikePdf(bytes)) throw httpError('Only PDF files can be added', 400);
    try {
      const doc = await PDFDocument.load(bytes);
      doc.getPageCount(); // garbage that slips past `load` (no page tree) throws here
      sources.push(doc);
    } catch (err) {
      const reason = err instanceof Error && /encrypted/i.test(err.message) ? 'is password-protected' : 'could not be read as a PDF';
      throw httpError(index === 0 ? `This document ${reason}` : `An uploaded file ${reason}`, 400);
    }
  }

  const output = await PDFDocument.create();
  for (const { source, pageIndex, rotate } of pages) {
    const sourceDoc = sources[source]!;
    if (pageIndex >= sourceDoc.getPageCount()) throw httpError('page index is out of range', 400);
    const [copied] = await output.copyPages(sourceDoc, [pageIndex]);
    const baseAngle = sourceDoc.getPage(pageIndex).getRotation().angle;
    copied!.setRotation(degrees((((baseAngle + rotate) % 360) + 360) % 360));
    output.addPage(copied!);
  }

  const bytes = await output.save();
  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw httpError(`The edited document exceeds the ${formatMegabytes(MAX_UPLOAD_BYTES)} limit`, 400);
  }
  return bytes;
}
