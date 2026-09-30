import { useEffect, useState } from 'react';
import type { Box, TextMarkupKind } from './textMarkup';

interface TextMarkupToolbarProps {
  onApply: (kind: TextMarkupKind, rects: Box[]) => void;
}

interface Anchor {
  x: number;
  y: number;
  rects: Box[];
}

const OPTIONS: Array<{ kind: TextMarkupKind; label: string; testId: string }> = [
  { kind: 'strikethrough', label: 'Strikethrough', testId: 'text-markup-strikethrough' },
  { kind: 'highlight', label: 'Highlight', testId: 'text-markup-highlight' },
  { kind: 'underline', label: 'Underline', testId: 'text-markup-underline' },
];

function inTextLayer(node: Node | null): boolean {
  const element = node instanceof Element ? node : node?.parentElement;
  return element?.closest('.pdf-text-layer') != null;
}

function readSelection(): Anchor | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!inTextLayer(range.startContainer) || !inTextLayer(range.endContainer)) return null;

  const rects: Box[] = Array.from(range.getClientRects())
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .map((rect) => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }));
  if (rects.length === 0) return null;

  const first = rects.reduce((best, rect) => (rect.top < best.top ? rect : best), rects[0]!);
  return { x: (first.left + first.right) / 2, y: first.top, rects };
}

// Floating Strikethrough / Highlight / Underline picker shown above a text
// selection made with the Hand tool (no annotation tool active). Choosing one
// turns the selected text into that annotation and clears the selection.
export default function TextMarkupToolbar({ onApply }: TextMarkupToolbarProps) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  useEffect(() => {
    const update = () => setAnchor(readSelection());
    // `selectionchange` fires continuously mid-drag; wait for the mouse/key
    // release so the picker appears once the selection is settled.
    const onSettled = () => window.setTimeout(update, 0);
    document.addEventListener('mouseup', onSettled);
    document.addEventListener('keyup', onSettled);
    const onSelectionChange = () => {
      if (window.getSelection()?.isCollapsed) setAnchor(null);
    };
    document.addEventListener('selectionchange', onSelectionChange);
    // Scrolling/zooming moves the text under the picker.
    document.addEventListener('scroll', update, true);
    return () => {
      document.removeEventListener('mouseup', onSettled);
      document.removeEventListener('keyup', onSettled);
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('scroll', update, true);
    };
  }, []);

  if (!anchor) return null;

  return (
    <div
      className="text-markup-toolbar"
      role="toolbar"
      aria-label="Text markup"
      data-testid="text-markup-toolbar"
      style={{ left: anchor.x, top: Math.max(anchor.y - 8, 8) }}
      // Keep the text selection alive while the picker is pressed.
      onMouseDown={(event) => event.preventDefault()}
    >
      {OPTIONS.map(({ kind, label, testId }) => (
        <button
          key={kind}
          type="button"
          className="text-markup-option"
          data-testid={testId}
          onClick={() => {
            onApply(kind, anchor.rects);
            window.getSelection()?.removeAllRanges();
            setAnchor(null);
          }}
        >
          <span className={`text-markup-glyph text-markup-glyph--${kind}`} aria-hidden="true">
            A
          </span>
          {label}
        </button>
      ))}
    </div>
  );
}
