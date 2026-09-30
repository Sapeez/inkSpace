// Pure geometry for the text-selection markup toolbar (highlight / underline /
// strikethrough). Kept DOM-free so it's unit-testable: the caller hands in
// plain boxes (from `Range.getClientRects()`) and gets back page-space shapes.
export type TextMarkupKind = 'highlight' | 'underline' | 'strikethrough';

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type MarkupShape =
  | { type: 'rect'; left: number; top: number; width: number; height: number }
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number };

export const MARKUP_COLORS = {
  highlight: '#ffe14d',
  underline: '#d64545',
  strikethrough: '#d64545',
} as const;
export const HIGHLIGHT_OPACITY = 0.4;
export const MARKUP_LINE_WIDTH = 1.5;

// How much of the shorter box's height must overlap vertically for two boxes
// to count as the same text line, and how far apart (px) they may sit
// horizontally and still be joined into one continuous run.
const SAME_LINE_OVERLAP = 0.5;
const JOIN_GAP_PX = 3;

function sameLine(a: Box, b: Box): boolean {
  const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  const shorter = Math.min(a.bottom - a.top, b.bottom - b.top);
  if (overlap < shorter * SAME_LINE_OVERLAP) return false;
  return a.left <= b.right + JOIN_GAP_PX && b.left <= a.right + JOIN_GAP_PX;
}

// A selection spanning several text spans yields one rect per span (plus
// duplicates/nested boxes). Collapse them into one box per visual line so a
// highlight or underline is continuous rather than a run of fragments.
export function mergeLineBoxes(boxes: Box[]): Box[] {
  const merged = boxes
    .filter((box) => box.right - box.left >= 1 && box.bottom - box.top >= 1)
    .map((box) => ({ ...box }));

  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < merged.length; i += 1) {
      for (let j = i + 1; j < merged.length; j += 1) {
        if (sameLine(merged[i]!, merged[j]!)) {
          const a = merged[i]!;
          const b = merged[j]!;
          a.left = Math.min(a.left, b.left);
          a.top = Math.min(a.top, b.top);
          a.right = Math.max(a.right, b.right);
          a.bottom = Math.max(a.bottom, b.bottom);
          merged.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }
  return merged.sort((a, b) => a.top - b.top || a.left - b.left);
}

// `box` is in page (PDF-point) space, y-down — the canvas's own space.
export function markupShape(kind: TextMarkupKind, box: Box): MarkupShape {
  const width = box.right - box.left;
  const height = box.bottom - box.top;
  if (kind === 'highlight') {
    return { type: 'rect', left: box.left, top: box.top, width, height };
  }
  const y = kind === 'underline' ? box.bottom - height * 0.12 : box.top + height * 0.55;
  return { type: 'line', x1: box.left, y1: y, x2: box.right, y2: y };
}
