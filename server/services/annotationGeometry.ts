// Pure coordinate math for burn-in.ts, split out from it (which also imports
// `pdf-lib`) so this — the highest-risk, hand-derived part of burn-in, and the
// part the "burn-in fidelity" success metric (spec.md §7) is actually about —
// can be unit-tested (tests/annotationGeometry.test.ts) independent of
// whether `pdf-lib` happens to be installed.
import type { AnnotationObjectJson } from './burn-in-types.js';

// Fabric's own default origin in the installed version (`fabric@7.4.0`) is
// 'center' for both axes (see spec.md §9's documented Rectangle/Ellipse/Text-
// Highlighter offset gap) — every object's `left`/`top` mean the position of
// *this* point on its own bounding box, not necessarily its top-left corner.
// Burn-in must read whichever origin Fabric actually serialized and reproduce
// on-screen position exactly, bug included — reproducing what's rendered is
// the fidelity requirement (Risk R1), not a place to silently "fix" a
// separately-tracked, separately-scoped bug.
export const ORIGIN_FRACTION: Record<string, number> = { left: 0, top: 0, center: 0.5, right: 1, bottom: 1 };

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Every Fabric object's current on-canvas bounding box, top-left corner,
// derived the same way for every type (Rect/Ellipse/Textbox/Image directly;
// Line/Path/Polygon additionally need this to place their *own* raw point
// data — see `makeLocalPointMapper` below).
export function boundingBoxTopLeft(object: AnnotationObjectJson): BoundingBox {
  const scaleX = object.scaleX ?? 1;
  const scaleY = object.scaleY ?? 1;
  const width = (object.width ?? 0) * scaleX;
  const height = (object.height ?? 0) * scaleY;
  const originX = ORIGIN_FRACTION[object.originX ?? 'center'] ?? 0.5;
  const originY = ORIGIN_FRACTION[object.originY ?? 'center'] ?? 0.5;
  return {
    x: (object.left ?? 0) - originX * width,
    y: (object.top ?? 0) - originY * height,
    width,
    height,
  };
}

// Fabric's y-axis grows downward from the page's top edge (matching pdf.js's
// scale-1 viewport, which is what AnnotationCanvas.jsx's per-page canvases are
// sized to) — PDF page space grows upward from the bottom. This is the one
// axis flip every drawing path needs exactly once.
export function flipY(canvasY: number, pageHeight: number): number {
  return pageHeight - canvasY;
}

// Line/Path/Polygon store their own raw point data (x1/y1/x2/y2, `points`, or
// SVG-style `path` commands) in the coordinate space it was originally
// created in — Fabric does NOT rewrite those numbers when the object is later
// moved or resized (only `left`/`top`/`scaleX`/`scaleY` change); it derives
// `width`/`height` once, at creation, as that raw data's own bounding box.
// Given the object's *current* bounding box (from `boundingBoxTopLeft`) and
// the raw data's own (unchanging) bounding box, any raw point maps to its
// current canvas position by re-anchoring it to the current box and applying
// the current scale — this is what keeps a dragged/resized Line, Polygon, or
// Cloud/Arrow/pen-stroke Path burning in at its current position, not its
// original one. Rotation (`angle`) is intentionally not accounted for here —
// a documented, accepted gap (see spec.md §9), consistent with nothing else
// in this feature handling Fabric's rotate control either.
export function makeLocalPointMapper(
  rawMinX: number,
  rawMinY: number,
  box: BoundingBox,
  object: AnnotationObjectJson,
): (point: { x: number; y: number }) => { x: number; y: number } {
  const scaleX = object.scaleX ?? 1;
  const scaleY = object.scaleY ?? 1;
  return (point) => ({
    x: box.x + (point.x - rawMinX) * scaleX,
    y: box.y + (point.y - rawMinY) * scaleY,
  });
}

// Every (x, y) pair inside a Fabric `path` command list (M/L/C/Q — Fabric
// normalizes arcs into these at parse time, see burn-in.ts's `drawPathShape`
// comment), used to compute the raw path's own bounding box for
// `makeLocalPointMapper` above.
export function numericPointsIn(path: Array<Array<string | number>>): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  for (const command of path) {
    for (let i = 1; i < command.length; i += 2) {
      const x = command[i];
      const y = command[i + 1];
      if (typeof x === 'number' && typeof y === 'number') points.push({ x, y });
    }
  }
  return points;
}

export function minOf(values: number[]): number {
  return values.length > 0 ? Math.min(...values) : 0;
}

// Rebuilds a Fabric `path` command list as an SVG path string in already-
// caller-transformed (e.g. PDF page) space — used by burn-in.ts's
// `drawPathShape` for Arrow/Cloud/pen-and-highlighter strokes, all of which
// are Fabric `Path` objects.
export function buildTransformedPathString(
  path: Array<Array<string | number>>,
  transformPoint: (point: { x: number; y: number }) => { x: number; y: number },
): string {
  return path
    .map((command) => {
      const [letter, ...coords] = command;
      const mapped: Array<string | number> = [letter as string];
      for (let i = 0; i < coords.length; i += 2) {
        const x = coords[i];
        const y = coords[i + 1];
        if (typeof x === 'number' && typeof y === 'number') {
          const point = transformPoint({ x, y });
          mapped.push(point.x, point.y);
        }
      }
      return mapped.join(' ');
    })
    .join(' ');
}

// Same idea as `buildTransformedPathString`, for a Polygon's `points` array
// (plain {x,y} objects, not SVG command tuples) — used by burn-in.ts's
// `drawPolygonShape`.
export function buildTransformedPolygonString(
  points: Array<{ x: number; y: number }>,
  transformPoint: (point: { x: number; y: number }) => { x: number; y: number },
): string {
  const mapped = points.map(transformPoint);
  return `${mapped.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')} Z`;
}
