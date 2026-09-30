import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_DRAFT_BYTES, validateDraftPages } from '../server/services/draftValidation.js';

const ok = [{ pageNumber: 1, objects: [{ type: 'Rect', left: 1 }] }];

test('validateDraftPages accepts an empty draft and a well-formed one', () => {
  assert.equal(validateDraftPages([]), null);
  assert.equal(validateDraftPages(ok), null);
});

test('validateDraftPages rejects malformed shapes', () => {
  assert.ok(validateDraftPages({ pages: [] }));
  assert.ok(validateDraftPages([{ pageNumber: 0, objects: [] }]));
  assert.ok(validateDraftPages([{ pageNumber: 1.5, objects: [] }]));
  assert.ok(validateDraftPages([{ pageNumber: 1, objects: 'x' }]));
  assert.ok(validateDraftPages([{ pageNumber: 1, objects: [{ left: 1 }] }]));
  assert.ok(validateDraftPages([{ pageNumber: 1, objects: [] }, { pageNumber: 1, objects: [] }]));
  assert.ok(validateDraftPages(['nope']));
});

test('validateDraftPages rejects a draft over the size limit', () => {
  const huge = [{ pageNumber: 1, objects: [{ type: 'Image', src: 'x'.repeat(MAX_DRAFT_BYTES) }] }];
  assert.match(validateDraftPages(huge) ?? '', /limit/);
});
