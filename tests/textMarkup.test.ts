import test from 'node:test';
import assert from 'node:assert/strict';
import { markupShape, mergeLineBoxes } from '../src/annotation-canvas/textMarkup.js';

test('mergeLineBoxes joins adjacent spans on the same line into one box', () => {
  const merged = mergeLineBoxes([
    { left: 10, top: 10, right: 50, bottom: 22 },
    { left: 51, top: 11, right: 90, bottom: 23 },
  ]);
  assert.deepEqual(merged, [{ left: 10, top: 10, right: 90, bottom: 23 }]);
});

test('mergeLineBoxes keeps different lines separate, ordered top to bottom', () => {
  const merged = mergeLineBoxes([
    { left: 10, top: 40, right: 80, bottom: 52 },
    { left: 10, top: 10, right: 80, bottom: 22 },
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0]!.top, 10);
});

test('mergeLineBoxes drops zero-size rects and collapses nested duplicates', () => {
  const merged = mergeLineBoxes([
    { left: 10, top: 10, right: 90, bottom: 22 },
    { left: 20, top: 10, right: 40, bottom: 22 },
    { left: 5, top: 5, right: 5, bottom: 30 },
  ]);
  assert.deepEqual(merged, [{ left: 10, top: 10, right: 90, bottom: 22 }]);
});

test('mergeLineBoxes does not join same-line boxes separated by a real gap', () => {
  assert.equal(
    mergeLineBoxes([
      { left: 10, top: 10, right: 40, bottom: 22 },
      { left: 100, top: 10, right: 140, bottom: 22 },
    ]).length,
    2,
  );
});

test('markupShape: highlight is a rect over the box; underline/strikethrough are horizontal lines', () => {
  const box = { left: 10, top: 100, right: 110, bottom: 120 };
  assert.deepEqual(markupShape('highlight', box), { type: 'rect', left: 10, top: 100, width: 100, height: 20 });

  const underline = markupShape('underline', box);
  const strike = markupShape('strikethrough', box);
  assert.ok(underline.type === 'line' && strike.type === 'line');
  assert.equal(underline.y1, underline.y2);
  assert.ok(underline.y1 > strike.y1, 'underline sits below the strikethrough');
  assert.ok(strike.y1 > 100 && strike.y1 < 120, 'strikethrough runs through the text');
  assert.ok(underline.y1 < 120 && underline.y1 > 110, 'underline sits near the baseline');
  assert.equal(underline.x1, 10);
  assert.equal(underline.x2, 110);
});
