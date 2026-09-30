import type { BurnInPage } from './burn-in-types.js';

// Generous enough for a busy annotation session plus a few embedded signature
// images (base64 in `src`), small enough to bound what one PUT can store.
export const MAX_DRAFT_BYTES = 8 * 1024 * 1024;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Dependency-free (no Supabase) so it's unit-testable. Returns the error
// message, or null when `pages` is an acceptable draft. Only the *shape* is
// checked — drawing semantics stay burn-in's job; a draft is never drawn
// until the user saves/downloads.
export function validateDraftPages(pages: unknown): string | null {
  if (!Array.isArray(pages)) return 'pages must be an array';
  const seen = new Set<number>();
  for (const page of pages) {
    if (!isPlainObject(page)) return 'each page must be an object';
    const { pageNumber, objects } = page;
    if (typeof pageNumber !== 'number' || !Number.isInteger(pageNumber) || pageNumber < 1) {
      return 'pageNumber must be a positive integer';
    }
    if (seen.has(pageNumber)) return `duplicate pageNumber ${pageNumber}`;
    seen.add(pageNumber);
    if (!Array.isArray(objects)) return 'objects must be an array';
    if (!objects.every((object) => isPlainObject(object) && typeof object.type === 'string')) {
      return 'every object needs a string type';
    }
  }
  if (Buffer.byteLength(JSON.stringify(pages)) > MAX_DRAFT_BYTES) {
    return `Draft exceeds the ${MAX_DRAFT_BYTES / (1024 * 1024)} MB limit`;
  }
  return null;
}

export type DraftPages = BurnInPage[];
