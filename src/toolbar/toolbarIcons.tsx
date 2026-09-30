// Minimal inline SVG icon set for the annotation toolbar (task 2.3) — no icon
// library dependency; each icon is a simple, recognizable line-drawing that
// inherits color from CSS (`stroke="currentColor"`) so it matches the active/
// inactive button state without a second set of assets.
import type { SVGProps } from 'react';

function IconBase(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export function HandIcon() {
  return (
    <IconBase>
      <path d="M8 13V5.5a1.5 1.5 0 013 0V11" />
      <path d="M11 10.5V4a1.5 1.5 0 013 0v6.5" />
      <path d="M14 10.5V5.5a1.5 1.5 0 013 0V13" />
      <path d="M17 9.5a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-1.5a6 6 0 01-4.6-2.1L4.5 15a1.5 1.5 0 012.3-1.9L8 14.5" />
    </IconBase>
  );
}

export function PenIcon() {
  return (
    <IconBase>
      <path d="M4 20l1-4.5L15.5 5 19 8.5 8.5 19 4 20z" />
      <path d="M13 7l3.5 3.5" />
    </IconBase>
  );
}

export function FreeformHighlighterIcon() {
  return (
    <IconBase>
      <path d="M5 19l1.5-4L15 6.5 18 9.5 9.5 18 5 19z" strokeWidth="2.25" />
      <path d="M4 21h6" strokeWidth="2.5" />
    </IconBase>
  );
}

export function TextIcon() {
  return (
    <IconBase>
      <path d="M5 5h14" />
      <path d="M12 5v14" />
    </IconBase>
  );
}

export function EllipseIcon() {
  return (
    <IconBase>
      <ellipse cx="12" cy="12" rx="8" ry="5.5" />
    </IconBase>
  );
}

export function RectangleIcon() {
  return (
    <IconBase>
      <rect x="4" y="6" width="16" height="12" rx="1.5" />
    </IconBase>
  );
}

export function LineIcon() {
  return (
    <IconBase>
      <path d="M5 19L19 5" />
    </IconBase>
  );
}

export function ArrowIcon() {
  return (
    <IconBase>
      <path d="M5 19L19 5" />
      <path d="M19 5v6" />
      <path d="M19 5h-6" />
    </IconBase>
  );
}

export function CloudIcon() {
  return (
    <IconBase>
      <path d="M7 17a4 4 0 0 1-.5-7.97A5 5 0 0 1 16 8.5a3.5 3.5 0 0 1 1 6.86" />
      <path d="M7 17h10" />
    </IconBase>
  );
}

export function SignatureIcon() {
  return (
    <IconBase>
      <path d="M7.5 2.5h7l5 5v11a3 3 0 01-3 3h-9a3 3 0 01-3-3v-13a3 3 0 013-3z" />
      <path d="M14.5 2.5V6a2 2 0 002 2h3" />
      <path d="M12 15v-4.5M9.5 12.5L12 10l2.5 2.5" />
      <path d="M8.5 16.5V19h7v-2.5" />
    </IconBase>
  );
}

// Solid floppy-disk glyph (unlike the line icons above, filled) — the notch,
// shutter, and label are even-odd cutouts/inlays in a single path.
export function SaveIcon() {
  return (
    <IconBase fill="currentColor" stroke="none">
      <path
        fillRule="evenodd"
        d="M5 3h13.7L21 5.3V19a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zM9 3h8.3v5.9H9zM14.2 3.7h2v4.8h-2zM6.7 13h10.8v6.3H6.7z"
      />
    </IconBase>
  );
}

export function DownloadIcon() {
  return (
    <IconBase>
      <path d="M12 3v12M7 10.5l5 4.5 5-4.5" />
      <path d="M4 15v1.5A2.5 2.5 0 006.5 19h11a2.5 2.5 0 002.5-2.5V15" />
    </IconBase>
  );
}
