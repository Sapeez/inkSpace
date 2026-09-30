import test from 'node:test';
import assert from 'node:assert/strict';
import {
  boundingBoxTopLeft,
  buildTransformedPathString,
  buildTransformedPolygonString,
  flipY,
  makeLocalPointMapper,
  minOf,
  numericPointsIn,
} from '../server/services/annotationGeometry.js';

test('boundingBoxTopLeft: an unscaled object with left/top origin is already its own top-left corner', () => {
  const box = boundingBoxTopLeft({ type: 'rect', left: 10, top: 20, width: 100, height: 50, originX: 'left', originY: 'top' });
  assert.deepEqual(box, { x: 10, y: 20, width: 100, height: 50 });
});

test('boundingBoxTopLeft: reproduces Fabric v7.4.0\'s documented center-origin offset bug (spec.md §9), not a corrected position', () => {
  // A 100x60 shape whose `left`/`top` is its *center* (Fabric's actual
  // default) sits with its top-left corner offset up-and-left by half its
  // own size — burn-in must match on-screen rendering bug-for-bug.
  const box = boundingBoxTopLeft({ type: 'rect', left: 60, top: 40, width: 100, height: 60, originX: 'center', originY: 'center' });
  assert.deepEqual(box, { x: 10, y: 10, width: 100, height: 60 });
});

test('boundingBoxTopLeft: defaults missing originX/originY to center, matching the installed Fabric version', () => {
  const withDefaults = boundingBoxTopLeft({ type: 'rect', left: 60, top: 40, width: 100, height: 60 });
  const withExplicitCenter = boundingBoxTopLeft({ type: 'rect', left: 60, top: 40, width: 100, height: 60, originX: 'center', originY: 'center' });
  assert.deepEqual(withDefaults, withExplicitCenter);
});

test('boundingBoxTopLeft: scaleX/scaleY are applied to width/height before computing the origin offset', () => {
  const box = boundingBoxTopLeft({
    type: 'rect', left: 100, top: 100, width: 50, height: 50, scaleX: 2, scaleY: 2, originX: 'center', originY: 'center',
  });
  assert.deepEqual(box, { x: 50, y: 50, width: 100, height: 100 });
});

test('flipY: converts a canvas y-down coordinate to PDF y-up space', () => {
  assert.equal(flipY(0, 800), 800);
  assert.equal(flipY(800, 800), 0);
  assert.equal(flipY(200, 800), 600);
});

test('minOf: returns 0 for an empty list rather than -Infinity', () => {
  assert.equal(minOf([]), 0);
});

test('minOf: returns the smallest value', () => {
  assert.equal(minOf([5, -3, 10]), -3);
});

test('numericPointsIn: extracts every (x, y) pair from M/L/C commands', () => {
  const path: Array<Array<string | number>> = [
    ['M', 0, 0],
    ['L', 10, 20],
    ['C', 1, 2, 3, 4, 5, 6],
  ];
  assert.deepEqual(numericPointsIn(path), [
    { x: 0, y: 0 },
    { x: 10, y: 20 },
    { x: 1, y: 2 },
    { x: 3, y: 4 },
    { x: 5, y: 6 },
  ]);
});

test('numericPointsIn: ignores non-numeric trailing flags (e.g. a raw, un-normalized arc command)', () => {
  const path: Array<Array<string | number>> = [['A', 5, 5, 0, 0, 1, 10, 10]];
  const points = numericPointsIn(path);
  assert.ok(points.length > 0);
  for (const point of points) {
    assert.equal(typeof point.x, 'number');
    assert.equal(typeof point.y, 'number');
  }
});

test('makeLocalPointMapper: an unmoved, unscaled object maps its raw points back to themselves shifted onto the box', () => {
  const object = { type: 'line', left: 10, top: 10, width: 20, height: 20, originX: 'left', originY: 'top' };
  const box = boundingBoxTopLeft(object);
  const mapPoint = makeLocalPointMapper(0, 0, box, object);
  assert.deepEqual(mapPoint({ x: 0, y: 0 }), { x: 10, y: 10 });
  assert.deepEqual(mapPoint({ x: 20, y: 20 }), { x: 30, y: 30 });
});

test('makeLocalPointMapper: a Line moved after creation burns in at its current position, not its original one', () => {
  // Created at (0,0)-(20,20) — raw x1/y1/x2/y2 never change on move — then
  // dragged so its bounding box's top-left is now at (100, 200).
  const object = { type: 'line', left: 100, top: 200, width: 20, height: 20, scaleX: 1, scaleY: 1, originX: 'left', originY: 'top' };
  const box = boundingBoxTopLeft(object);
  const mapPoint = makeLocalPointMapper(0, 0, box, object);
  assert.deepEqual(mapPoint({ x: 0, y: 0 }), { x: 100, y: 200 });
  assert.deepEqual(mapPoint({ x: 20, y: 20 }), { x: 120, y: 220 });
});

test('makeLocalPointMapper: a resized (scaled) object maps raw points proportionally, not by a fixed offset', () => {
  const object = { type: 'polygon', left: 0, top: 0, width: 10, height: 10, scaleX: 3, scaleY: 3, originX: 'left', originY: 'top' };
  const box = boundingBoxTopLeft(object);
  const mapPoint = makeLocalPointMapper(0, 0, box, object);
  assert.deepEqual(mapPoint({ x: 5, y: 5 }), { x: 15, y: 15 });
});

test('buildTransformedPathString: rebuilds an M/L/Z path with each point run through the transform', () => {
  const path: Array<Array<string | number>> = [
    ['M', 0, 0],
    ['L', 10, 0],
    ['Z'],
  ];
  const result = buildTransformedPathString(path, (p) => ({ x: p.x + 1, y: p.y + 2 }));
  assert.equal(result, 'M 1 2 L 11 2 Z');
});

test('buildTransformedPolygonString: closes the loop back to the first (transformed) point', () => {
  const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
  const result = buildTransformedPolygonString(points, (p) => p);
  assert.equal(result, 'M 0 0 L 10 0 L 10 10 Z');
});

// Cross-check against pdf.js's own viewport math (the renderer that decides what
// "displayed" means): a displayed point, pushed through `displayToUserMatrix`,
// must land on the user-space point pdf.js says sits there.
test('displayToUserMatrix agrees with pdf.js for every /Rotate value', async () => {
  const { PDFDocument, degrees } = await import('pdf-lib');
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const { displayToUserMatrix } = await import('../server/services/annotationGeometry.js');

  const width = 200;
  const height = 100;
  for (const rotation of [0, 90, 180, 270]) {
    const doc = await PDFDocument.create();
    doc.addPage([width, height]).setRotation(degrees(rotation));
    const pdf = await getDocument({ data: new Uint8Array(await doc.save()) }).promise;
    const viewport = (await pdf.getPage(1)).getViewport({ scale: 1 });
    assert.equal(viewport.width, rotation % 180 === 0 ? width : height);

    for (const [displayX, displayYdown] of [[0, 0], [30, 10], [viewport.width, viewport.height], [7, 61]] as const) {
      const [expectedX, expectedY] = viewport.convertToPdfPoint(displayX, displayYdown);
      const displayYup = viewport.height - displayYdown;
      const [a, b, c, d, e, f] = displayToUserMatrix(rotation, width, height);
      const x = a * displayX + c * displayYup + e;
      const y = b * displayX + d * displayYup + f;
      assert.ok(Math.abs(x - expectedX!) < 1e-6 && Math.abs(y - expectedY!) < 1e-6, `rotation ${rotation} at (${displayX}, ${displayYdown}): got (${x}, ${y}), pdf.js says (${expectedX}, ${expectedY})`);
    }
  }
});

test('rotationAboutMatrix keeps its pivot fixed and turns a point clockwise (as seen on the y-down canvas)', async () => {
  const { rotationAboutMatrix } = await import('../server/services/annotationGeometry.js');
  const apply = ([a, b, c, d, e, f]: number[], x: number, y: number) => [a! * x + c! * y + e!, b! * x + d! * y + f!] as const;

  const pivot = [50, 80] as const; // PDF space, y-up
  const matrix = rotationAboutMatrix(pivot[0], pivot[1], 90);
  const [px, py] = apply(matrix, ...pivot);
  assert.ok(Math.abs(px - 50) < 1e-9 && Math.abs(py - 80) < 1e-9);

  // A point to the right of the pivot swings *down* the page when rotated 90° clockwise.
  const [x, y] = apply(matrix, 60, 80);
  assert.ok(Math.abs(x - 50) < 1e-9 && Math.abs(y - 70) < 1e-9);
});
