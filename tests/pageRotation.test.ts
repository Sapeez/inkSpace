import test from 'node:test';
import assert from 'node:assert/strict';
import { Rect, Line } from 'fabric/node';
import { rotateAnnotationObject } from '../src/annotation-canvas/pageRotation.js';
import type { PageRotation } from '../src/annotation-canvas/pageRotation.js';

const WIDTH = 600;
const HEIGHT = 800;

// The page itself, rotated clockwise, sends a canvas point (x, y) to:
function pagePoint(x: number, y: number, rotation: PageRotation): [number, number] {
  if (rotation === 90) return [HEIGHT - y, x];
  if (rotation === 180) return [WIDTH - x, HEIGHT - y];
  if (rotation === 270) return [y, WIDTH - x];
  return [x, y];
}

function corners(object: Rect | Line): Array<[number, number]> {
  return object.getCoords().map((point) => [point.x, point.y] as [number, number]);
}

// Ground truth is Fabric itself: rotate the object's four on-canvas corners the
// way the page rotates, and compare with the corners of the rotated *JSON*
// loaded back into a real Fabric object.
for (const rotation of [90, 180, 270] as const) {
  for (const originX of ['left', 'center'] as const) {
    test(`rotateAnnotationObject turns a Rect (origin ${originX}, own angle 20°) with a ${rotation}° page rotation`, () => {
      const before = new Rect({ left: 120, top: 200, width: 150, height: 60, angle: 20, originX, originY: originX === 'left' ? 'top' : 'center' });
      const json = before.toObject() as unknown as { left: number; top: number; angle: number } & Record<string, unknown>;
      const after = new Rect(rotateAnnotationObject(json, rotation, WIDTH, HEIGHT) as never);

      const expected = corners(before).map(([x, y]) => pagePoint(x, y, rotation));
      const actual = corners(after);
      expected.forEach(([x, y], i) => {
        assert.ok(Math.abs(x - actual[i]![0]) < 1e-6 && Math.abs(y - actual[i]![1]) < 1e-6, `corner ${i}: expected (${x}, ${y}), got (${actual[i]})`);
      });
    });
  }
}

test('rotateAnnotationObject turns a Line the same way, and is a no-op at 0°', () => {
  const before = new Line([10, 20, 210, 120], { stroke: '#000' });
  const json = before.toObject() as unknown as { left: number; top: number; angle: number } & Record<string, unknown>;
  const after = new Line([10, 20, 210, 120], rotateAnnotationObject(json, 90, WIDTH, HEIGHT) as never);
  const expected = corners(before).map(([x, y]) => pagePoint(x, y, 90));
  corners(after).forEach(([x, y], i) => {
    assert.ok(Math.abs(x - expected[i]![0]) < 1e-6 && Math.abs(y - expected[i]![1]) < 1e-6, `line corner ${i}`);
  });

  assert.equal(rotateAnnotationObject(json, 0, WIDTH, HEIGHT), json);
});
