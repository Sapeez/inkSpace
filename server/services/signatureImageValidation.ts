// Split out of burn-in.ts (which also imports `pdf-lib`) for the same reason
// annotationGeometry.ts was: this is the actual security-relevant logic for
// R8/tasks 5.3/5.6 (reject an oversized or disguised signature image before
// it's ever decoded), and dependency-free code can be unit-tested
// (tests/signatureImageValidation.test.ts) independent of whether `pdf-lib`
// happens to be installed.
import { MAX_SIGNATURE_IMAGE_BYTES, SIGNATURE_IMAGE_DATA_URL_PREFIX } from '../../src/utils/signatureImageLimits.js';

// Task 5.3/5.6: SignatureUploader.tsx's type/size check is client-side only —
// a caller that hits the burn-in endpoint directly (bypassing the browser
// entirely) could send an `image` object with an arbitrary `src`. Rejecting
// anything that isn't this exact prefix, before ever handing bytes to
// pdf-lib's `embedPng`, covers both R8's "no disguised file" requirement (an
// attacker's own bytes are never trusted to *be* a PNG just because pdf-lib
// will try to parse them as one) and the size limit — `embedPng` decodes the
// full image into memory, so the size check must run before that call, not
// after. Reusing `MAX_SIGNATURE_IMAGE_BYTES` (not a separate constant) is
// what keeps this from drifting from SignatureUploader.tsx's own client-side
// limit. Returns the decoded bytes so the one caller (burn-in.ts) doesn't
// need to re-slice/re-decode the data URL itself.
export function decodeValidatedSignatureImage(src: string): Buffer {
  if (!src.startsWith(SIGNATURE_IMAGE_DATA_URL_PREFIX)) {
    throw Object.assign(new Error('Signature image must be a re-encoded PNG data URL'), { status: 400 });
  }
  const base64 = src.slice(SIGNATURE_IMAGE_DATA_URL_PREFIX.length);
  if (Buffer.byteLength(base64, 'base64') > MAX_SIGNATURE_IMAGE_BYTES) {
    throw Object.assign(new Error('Signature image exceeds the maximum allowed size'), { status: 400 });
  }
  return Buffer.from(base64, 'base64');
}
