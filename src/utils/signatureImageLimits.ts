// Single source of truth for the signature-image upload limit (A8/R8),
// shared by the client-side check (SignatureUploader.tsx, instant feedback)
// and the server-side check (server/services/burn-in.ts, authoritative —
// task 5.3/5.6) so the two can't drift apart. `server/` importing straight
// from `src/utils/` mirrors the existing `filenameUtils.ts` convention
// (attachments.js already imports that the same way for F4-F6).
export const MAX_SIGNATURE_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_SIGNATURE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

// Every signature this system ever legitimately produces is re-encoded
// through an offscreen `<canvas>.toDataURL()` (no args -> PNG) before being
// placed (SignatureUploader.tsx's `reencodeToCanvas`) — regardless of the
// originally uploaded file's type. So while the *client-side* type check
// above accepts PNG/JPEG/GIF/WebP uploads, the server only ever needs to
// accept this one wire format for the `image`-type annotation objects it
// burns in; anything else did not come from this app's own upload flow.
export const SIGNATURE_IMAGE_DATA_URL_PREFIX = 'data:image/png;base64,';
