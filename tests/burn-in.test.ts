import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, degrees } from 'pdf-lib';
import { Rect, Textbox } from 'fabric/node';
import { burnInPdfBytes } from '../server/services/burn-in.js';

async function blankPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  return doc.save();
}

// Regression: Fabric 7 serializes `type` capitalized ("Rect", "Textbox"); burn-in
// once matched only lowercase, silently skipping every annotation on Save.
test('burnInPdfBytes: draws objects exactly as Fabric serializes them (capitalized type)', async () => {
  const original = await blankPdf();
  const objects = [
    new Rect({ left: 10, top: 10, width: 50, height: 50, fill: '#ff0000', originX: 'left', originY: 'top' }).toObject(),
    new Textbox('hello', { left: 80, top: 80, width: 100, fill: '#000000' }).toObject(),
  ];
  assert.deepEqual(objects.map((o) => (o as unknown as { type: string }).type), ['Rect', 'Textbox']);

  const burned = await burnInPdfBytes(original, [{ pageNumber: 1, objects: objects as never }]);
  const untouched = await burnInPdfBytes(original, []);

  assert.ok(burned.length > untouched.length, 'annotations should add content to the page');
});

test('burnInPdfBytes: bold, italic and underline text render and change the output', async () => {
  const original = await blankPdf();
  const text = (extra: object) =>
    new Textbox('hello', { left: 20, top: 20, width: 100, fill: '#000000', ...extra }).toObject() as never;
  const burn = (extra: object) => burnInPdfBytes(original, [{ pageNumber: 1, objects: [text(extra)] }]);

  const plain = await burn({});
  const bold = await burn({ fontWeight: 'bold' });
  const italic = await burn({ fontStyle: 'italic' });
  const underlined = await burn({ underline: true });

  assert.notDeepEqual(bold, plain);
  assert.notDeepEqual(italic, plain);
  assert.notDeepEqual(underlined, plain);
  assert.notDeepEqual(bold, italic);
});

// Rotation support: a page with /Rotate and objects with Fabric `angle` are drawn
// inside `cm` transforms (math itself is cross-checked against pdf.js in
// tests/annotationGeometry.test.ts). Here: the output still parses, and the
// transforms really are in the content stream.
async function countTransforms(bytes: Uint8Array): Promise<number> {
  const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await getDocument({ data: new Uint8Array(bytes) }).promise;
  const operators = await (await pdf.getPage(1)).getOperatorList();
  return operators.fnArray.filter((fn: number) => fn === OPS.transform).length;
}

test('burnInPdfBytes: a rotated page and a rotated object are drawn inside transforms', async () => {
  const rect = new Rect({ left: 10, top: 10, width: 50, height: 50, fill: '#ff0000', originX: 'left', originY: 'top' }).toObject() as never;
  const rotatedRect = new Rect({ left: 40, top: 40, width: 50, height: 20, fill: '#0000ff', originX: 'left', originY: 'top', angle: 30 }).toObject() as never;

  const plain = await burnInPdfBytes(await blankPdf(), [{ pageNumber: 1, objects: [rect] }]);
  const plainTransforms = await countTransforms(plain);

  const objectRotated = await burnInPdfBytes(await blankPdf(), [{ pageNumber: 1, objects: [rotatedRect] }]);
  assert.ok((await countTransforms(objectRotated)) > plainTransforms, 'an object with an angle gets its own rotation transform');

  const doc = await PDFDocument.create();
  doc.addPage([200, 100]).setRotation(degrees(90));
  const pageRotated = await burnInPdfBytes(await doc.save(), [{ pageNumber: 1, objects: [rect] }]);
  assert.ok((await countTransforms(pageRotated)) > plainTransforms, 'a /Rotate page gets a display-to-user transform');
});
