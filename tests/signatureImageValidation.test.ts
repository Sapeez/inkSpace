import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeValidatedSignatureImage } from '../server/services/signatureImageValidation.js';
import { MAX_SIGNATURE_IMAGE_BYTES } from '../src/utils/signatureImageLimits.js';

const PNG_PREFIX = 'data:image/png;base64,';

test('5.6: decodes a well-formed signature data URL to its raw bytes', () => {
  const bytes = decodeValidatedSignatureImage(`${PNG_PREFIX}${Buffer.from('hello').toString('base64')}`);
  assert.equal(bytes.toString('utf8'), 'hello');
});

test('5.3/5.6/R8: rejects a src claiming a non-PNG mime type, even with real-looking bytes', () => {
  assert.throws(
    () => decodeValidatedSignatureImage(`data:image/jpeg;base64,${Buffer.from('hello').toString('base64')}`),
    (err: unknown) => err instanceof Error && (err as Error & { status?: number }).status === 400,
  );
});

test('5.3/5.6/R8: rejects a src with no data-URL prefix at all (a disguised/malicious payload)', () => {
  assert.throws(
    () => decodeValidatedSignatureImage('<script>alert(1)</script>'),
    (err: unknown) => err instanceof Error && (err as Error & { status?: number }).status === 400,
  );
});

test('5.3: accepts a payload exactly at MAX_SIGNATURE_IMAGE_BYTES', () => {
  const base64 = Buffer.alloc(MAX_SIGNATURE_IMAGE_BYTES).toString('base64');
  const bytes = decodeValidatedSignatureImage(`${PNG_PREFIX}${base64}`);
  assert.equal(bytes.length, MAX_SIGNATURE_IMAGE_BYTES);
});

test('5.3: rejects a payload one byte over MAX_SIGNATURE_IMAGE_BYTES — the authoritative, server-side check', () => {
  const base64 = Buffer.alloc(MAX_SIGNATURE_IMAGE_BYTES + 1).toString('base64');
  assert.throws(
    () => decodeValidatedSignatureImage(`${PNG_PREFIX}${base64}`),
    (err: unknown) => err instanceof Error && (err as Error & { status?: number }).status === 400,
  );
});
