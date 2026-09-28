import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_UPLOAD_BYTES, formatMegabytes, estimateBase64ByteLength } from '../src/utils/uploadLimits.js';

test('formatMegabytes renders MAX_UPLOAD_BYTES as a whole-number MB string', () => {
  assert.equal(formatMegabytes(MAX_UPLOAD_BYTES), '14MB');
});

test('estimateBase64ByteLength matches Buffer.byteLength for an unpadded payload', () => {
  const base64 = Buffer.from('a'.repeat(300)).toString('base64');
  assert.equal(base64.length % 4, 0);
  assert.equal(estimateBase64ByteLength(base64), Buffer.byteLength(base64, 'base64'));
});

test('estimateBase64ByteLength matches Buffer.byteLength for 1 and 2 bytes of padding', () => {
  for (const size of [301, 302]) {
    const base64 = Buffer.from('a'.repeat(size)).toString('base64');
    assert.equal(estimateBase64ByteLength(base64), Buffer.byteLength(base64, 'base64'));
  }
});
