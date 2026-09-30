import type { PageRotation } from '../annotation-canvas/pageRotation';

// The Document editor works on a list of these, in final order. `source` 0 is
// the file being edited; 1..n are PDFs uploaded in this editing session.
// `rotation` is the extra clockwise rotation applied in this session.
export interface EditPage {
  key: string;
  source: number;
  pageIndex: number;
  rotation: PageRotation;
}

export function initialPages(pageCount: number): EditPage[] {
  return Array.from({ length: pageCount }, (_, pageIndex) => ({ key: `0-${pageIndex}`, source: 0, pageIndex, rotation: 0 }));
}

export function pagesFromUpload(source: number, pageCount: number): EditPage[] {
  return Array.from({ length: pageCount }, (_, pageIndex) => ({ key: `${source}-${pageIndex}`, source, pageIndex, rotation: 0 }));
}

// Inserts `items` right after `afterIndex` (the focused page).
export function insertAfter(pages: EditPage[], afterIndex: number, items: EditPage[]): EditPage[] {
  return [...pages.slice(0, afterIndex + 1), ...items, ...pages.slice(afterIndex + 1)];
}

// Moves exactly one page: it ends up at `toIndex` in the new order.
export function movePage(pages: EditPage[], fromIndex: number, toIndex: number): EditPage[] {
  if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= pages.length || toIndex < 0 || toIndex >= pages.length) return pages;
  const next = [...pages];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved!);
  return next;
}

export function rotatePage(pages: EditPage[], index: number, delta: 90 | -90): EditPage[] {
  return pages.map((page, i) =>
    i === index ? { ...page, rotation: ((((page.rotation + delta) % 360) + 360) % 360) as PageRotation } : page,
  );
}

// A document always keeps at least one page.
export function deletePage(pages: EditPage[], index: number): EditPage[] {
  if (pages.length <= 1 || index < 0 || index >= pages.length) return pages;
  return pages.filter((_, i) => i !== index);
}

export function hasChanges(pages: EditPage[], originalPageCount: number): boolean {
  if (pages.length !== originalPageCount) return true;
  return pages.some((page, i) => page.source !== 0 || page.pageIndex !== i || page.rotation !== 0);
}

// Body for POST /api/attachments/:id/pages (minus the uploads themselves).
export function toPageSpecs(pages: EditPage[]): Array<{ source: number; pageIndex: number; rotate: number }> {
  return pages.map(({ source, pageIndex, rotation }) => ({ source, pageIndex, rotate: rotation }));
}

// Where each surviving original page ends up (1-based page numbers), so the
// annotations on it can follow. Deleted pages have no entry; uploaded pages have
// no annotations.
export function toAnnotationMapping(pages: EditPage[]): Array<{ oldPage: number; newPage: number; rotation: PageRotation }> {
  const mapping: Array<{ oldPage: number; newPage: number; rotation: PageRotation }> = [];
  pages.forEach((page, index) => {
    if (page.source === 0) mapping.push({ oldPage: page.pageIndex + 1, newPage: index + 1, rotation: page.rotation });
  });
  return mapping;
}
