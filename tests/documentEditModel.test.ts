import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deletePage,
  hasChanges,
  initialPages,
  insertAfter,
  movePage,
  pagesFromUpload,
  rotatePage,
  toAnnotationMapping,
  toPageSpecs,
} from '../src/viewer/documentEditModel.js';

const keys = (pages: Array<{ key: string }>) => pages.map((page) => page.key);

test('insertAfter puts uploaded pages right after the focused page, in order', () => {
  const pages = insertAfter(initialPages(3), 1, pagesFromUpload(1, 2));
  assert.deepEqual(keys(pages), ['0-0', '0-1', '1-0', '1-1', '0-2']);
});

test('movePage repositions exactly one page, both directions, and ignores no-ops', () => {
  const pages = initialPages(4);
  assert.deepEqual(keys(movePage(pages, 0, 2)), ['0-1', '0-2', '0-0', '0-3']);
  assert.deepEqual(keys(movePage(pages, 3, 1)), ['0-0', '0-3', '0-1', '0-2']);
  assert.equal(movePage(pages, 2, 2), pages);
  assert.equal(movePage(pages, 0, 9), pages);
});

test('rotatePage turns only the chosen page, wrapping around in both directions', () => {
  let pages = rotatePage(initialPages(2), 1, 90);
  assert.deepEqual(pages.map((page) => page.rotation), [0, 90]);
  pages = rotatePage(rotatePage(rotatePage(pages, 1, 90), 1, 90), 1, 90);
  assert.equal(pages[1]!.rotation, 0);
  assert.equal(rotatePage(initialPages(1), 0, -90)[0]!.rotation, 270);
});

test('deletePage removes the page but never the last one', () => {
  assert.deepEqual(keys(deletePage(initialPages(3), 1)), ['0-0', '0-2']);
  const single = initialPages(1);
  assert.equal(deletePage(single, 0), single);
});

test('hasChanges is false for an untouched list and true after any edit, including a move back-and-forth that nets out', () => {
  const original = initialPages(3);
  assert.equal(hasChanges(original, 3), false);
  assert.equal(hasChanges(movePage(original, 0, 1), 3), true);
  assert.equal(hasChanges(movePage(movePage(original, 0, 1), 1, 0), 3), false);
  assert.equal(hasChanges(rotatePage(original, 0, 90), 3), true);
  assert.equal(hasChanges(deletePage(original, 0), 3), true);
  assert.equal(hasChanges(insertAfter(original, 0, pagesFromUpload(1, 1)), 3), true);
});

test('toPageSpecs and toAnnotationMapping describe the final order', () => {
  let pages = insertAfter(initialPages(3), 0, pagesFromUpload(1, 1)); // 0-0, 1-0, 0-1, 0-2
  pages = deletePage(pages, 2); // drops original page 2
  pages = rotatePage(pages, 0, 90);

  assert.deepEqual(toPageSpecs(pages), [
    { source: 0, pageIndex: 0, rotate: 90 },
    { source: 1, pageIndex: 0, rotate: 0 },
    { source: 0, pageIndex: 2, rotate: 0 },
  ]);
  assert.deepEqual(toAnnotationMapping(pages), [
    { oldPage: 1, newPage: 1, rotation: 90 },
    { oldPage: 3, newPage: 3, rotation: 0 },
  ]);
});
