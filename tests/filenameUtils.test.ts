import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatUtcTimestamp,
  generateDefaultFilename,
  validateFilename,
} from '../src/utils/filenameUtils.js';

test('formatUtcTimestamp renders DDMMYYYYHHmm in UTC regardless of local offset', () => {
  const date = new Date('2026-09-27T18:34:00+05:00'); // 13:34 UTC
  assert.equal(formatUtcTimestamp(date), '270920261334');
});

test('formatUtcTimestamp zero-pads every field', () => {
  const date = new Date('2026-01-02T03:04:00Z');
  assert.equal(formatUtcTimestamp(date), '020120260304');
});

test('generateDefaultFilename appends a UTC timestamp before the extension', () => {
  const now = new Date('2026-09-27T18:34:00Z');
  assert.equal(generateDefaultFilename('report.pdf', now), 'report 270920261834.pdf');
});

test('generateDefaultFilename preserves the extension when no timestamp exists yet', () => {
  const now = new Date('2026-09-27T18:34:00Z');
  assert.equal(generateDefaultFilename('quarterly-report.pdf', now), 'quarterly-report 270920261834.pdf');
});

test('generateDefaultFilename handles a filename with no extension', () => {
  const now = new Date('2026-09-27T18:34:00Z');
  assert.equal(generateDefaultFilename('report', now), 'report 270920261834');
});

test('F3: generateDefaultFilename replaces an existing trailing timestamp instead of appending a second one', () => {
  const now = new Date('2026-09-27T18:34:00Z');
  const alreadyTimestamped = 'report 240820250715.pdf';
  const result = generateDefaultFilename(alreadyTimestamped, now);
  assert.equal(result, 'report 270920261834.pdf');
  assert.equal(result.match(/\d{12}/g)?.length, 1);
});

test('F3: does not treat a non-timestamp trailing number as a timestamp to replace', () => {
  const now = new Date('2026-09-27T18:34:00Z');
  const result = generateDefaultFilename('invoice 42.pdf', now);
  assert.equal(result, 'invoice 42 270920261834.pdf');
});

test('F4: validateFilename rejects an empty string', () => {
  assert.equal(validateFilename(''), 'Required field');
});

test('F4: validateFilename rejects a whitespace-only string', () => {
  assert.equal(validateFilename('   '), 'Required field');
});

test('F5: validateFilename accepts exactly 255 characters', () => {
  const name = `${'a'.repeat(251)}.pdf`; // 255 chars total
  assert.equal(name.length, 255);
  assert.equal(validateFilename(name), null);
});

test('F5: validateFilename rejects 256 characters', () => {
  const name = `${'a'.repeat(252)}.pdf`; // 256 chars total
  assert.equal(name.length, 256);
  assert.equal(validateFilename(name), '255 characters maximum');
});

test('F6: validateFilename rejects path separators', () => {
  assert.equal(validateFilename('report/draft.pdf'), 'Invalid characters');
  assert.equal(validateFilename('report\\draft.pdf'), 'Invalid characters');
});

test('F6: validateFilename rejects OS-reserved characters', () => {
  for (const char of ['*', '?', '"', '<', '>', '|', ':']) {
    assert.equal(validateFilename(`report${char}.pdf`), 'Invalid characters', `expected rejection for "${char}"`);
  }
});

test('validateFilename accepts a valid name with no timestamp', () => {
  assert.equal(validateFilename('quarterly-report.pdf'), null);
});
