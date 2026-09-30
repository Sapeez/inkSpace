// When the Document editor rotates a page, annotations already on it must turn
// with it. Fabric rotates an object about its (left, top) origin point, so a
// page rotation is a rigid move of that point plus an `angle` change — no
// per-shape math. Coordinates are the canvas's own (PDF points, y-down) on the
// page *before* rotating: `width` × `height`.
export type PageRotation = 0 | 90 | 180 | 270;

interface PlacedObject {
  left?: number;
  top?: number;
  angle?: number;
  [key: string]: unknown;
}

function rotatePoint(x: number, y: number, rotation: PageRotation, width: number, height: number): [number, number] {
  switch (rotation) {
    case 90:
      return [height - y, x];
    case 180:
      return [width - x, height - y];
    case 270:
      return [y, width - x];
    default:
      return [x, y];
  }
}

export function rotateAnnotationObject<T extends PlacedObject>(object: T, rotation: PageRotation, width: number, height: number): T {
  if (rotation === 0) return object;
  const [left, top] = rotatePoint(object.left ?? 0, object.top ?? 0, rotation, width, height);
  return { ...object, left, top, angle: (((object.angle ?? 0) + rotation) % 360 + 360) % 360 };
}
