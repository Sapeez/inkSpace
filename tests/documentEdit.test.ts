import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, degrees } from 'pdf-lib';
import { applyPageEdits, validatePageSpecs } from '../server/services/documentEdit.js';

// Pages are told apart by their width (100, 200, 300, …).
async function pdfWithWidths(widths: number[], rotations: number[] = []): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  widths.forEach((width, i) => {
    const page = doc.addPage([width, 50]);
    if (rotations[i]) page.setRotation(degrees(rotations[i]!));
  });
  return doc.save();
}

async function widthsOf(bytes: Uint8Array): Promise<number[]> {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => page.getWidth());
}

test('applyPageEdits reorders pages and drops deleted ones', async () => {
  const original = await pdfWithWidths([100, 200, 300]);
  const out = await applyPageEdits(original, [], [
    { source: 0, pageIndex: 2, rotate: 0 },
    { source: 0, pageIndex: 0, rotate: 0 },
  ]);
  assert.deepEqual(await widthsOf(out), [300, 100]);
});

test('applyPageEdits inserts uploaded pages where asked, in order', async () => {
  const original = await pdfWithWidths([100, 200]);
  const upload = await pdfWithWidths([700, 800]);
  const out = await applyPageEdits(original, [upload], [
    { source: 0, pageIndex: 0, rotate: 0 },
    { source: 1, pageIndex: 0, rotate: 0 },
    { source: 1, pageIndex: 1, rotate: 0 },
    { source: 0, pageIndex: 1, rotate: 0 },
  ]);
  assert.deepEqual(await widthsOf(out), [100, 700, 800, 200]);
});

test('applyPageEdits adds the requested rotation on top of the source page\'s own', async () => {
  const original = await pdfWithWidths([100, 200], [90, 0]);
  const out = await applyPageEdits(original, [], [
    { source: 0, pageIndex: 0, rotate: 90 },
    { source: 0, pageIndex: 1, rotate: 270 },
  ]);
  const doc = await PDFDocument.load(out);
  assert.deepEqual(doc.getPages().map((page) => page.getRotation().angle), [180, 270]);
});

test('applyPageEdits rejects non-PDF uploads, corrupt PDFs, and bad specs with a 400', async () => {
  const original = await pdfWithWidths([100]);
  const page = [{ source: 0, pageIndex: 0, rotate: 0 }];
  await assert.rejects(() => applyPageEdits(original, [new TextEncoder().encode('hello')], page), { status: 400 });
  await assert.rejects(
    () => applyPageEdits(original, [new TextEncoder().encode('%PDF-1.4 not really')], [{ source: 1, pageIndex: 0, rotate: 0 }]),
    { status: 400 },
  );
  await assert.rejects(() => applyPageEdits(original, [], [{ source: 0, pageIndex: 5, rotate: 0 }]), { status: 400 });
  await assert.rejects(() => applyPageEdits(original, [], []), { status: 400 });
});

test('validatePageSpecs checks source range, index and rotation values', () => {
  assert.equal(validatePageSpecs([{ source: 0, pageIndex: 0, rotate: 90 }], 0), null);
  assert.ok(validatePageSpecs([{ source: 1, pageIndex: 0, rotate: 0 }], 0));
  assert.ok(validatePageSpecs([{ source: 0, pageIndex: -1, rotate: 0 }], 0));
  assert.ok(validatePageSpecs([{ source: 0, pageIndex: 0, rotate: 45 }], 0));
  assert.ok(validatePageSpecs('nope', 0));
});
