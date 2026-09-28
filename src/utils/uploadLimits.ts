// Task 5.3: the authoritative, user-facing size limit on a PDF entering
// storage. This app has no "pick a PDF off your disk" upload flow (the
// accounts/workspace track owns that, out of scope here) — the only place a
// *new* PDF's bytes enter the system is the Save-as-new-attachment flow
// (burn-in's output, POST /api/attachments), so that is what this limit
// gates. Kept under `server/index.js`'s 20mb JSON body-parser ceiling (which
// exists only so a legitimate file doesn't get a raw, unhelpful 413 before
// this check even runs) with real headroom, not just up to it: base64
// inflates bytes by exactly 4/3, so a file *at* this limit becomes
// `Math.ceil(14 * 1024 * 1024 / 3) * 4` = 19,573,420 base64 bytes — about
// 1.3MB of slack below the 20mb ceiling for the JSON envelope
// (`{"filename":"...","pdfBase64":"..."}`) around it. Found in code review:
// an earlier 15MB value base64-encoded to *exactly* 20,971,520 bytes, equal
// to the body-parser limit with zero headroom — Express would 413 a
// legitimately-sized file (which both the client and server checks here
// would otherwise call valid) before this friendly message ever ran.
export const MAX_UPLOAD_BYTES = 14 * 1024 * 1024;

export function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))}MB`;
}

// Client-side instant-feedback half of the check in `SaveModal.tsx` — no
// `Buffer` in the browser, so this estimates the decoded byte length
// straight from the base64 string's own length/padding instead (exact
// server-side check is `Buffer.byteLength(str, 'base64')` in attachments.js).
export function estimateBase64ByteLength(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return (base64.length / 4) * 3 - padding;
}
