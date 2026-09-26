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

export function TextHighlighterIcon() {
  return (
    <IconBase>
      <path d="M6 6h12" />
      <path d="M6 12h12" />
      <path d="M4.5 17h10" strokeWidth="4" stroke="currentColor" opacity="0.35" />
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

export function PolygonIcon() {
  return (
    <IconBase>
      <path d="M12 4l7 5-2.7 8H7.7L5 9z" />
    </IconBase>
  );
}

export function SignatureIcon() {
  return (
    <IconBase>
      <path d="M4 17c2-1 3-3 3.5-5 .5-2-.2-3.5-1.5-3-1.3.5-1 3 1 4.5 2.3 1.7 5-.5 6-2.5.7-1.4 1.7-1.4 2 0 .3 1.4 1.7 2.4 4 1" />
    </IconBase>
  );
}
