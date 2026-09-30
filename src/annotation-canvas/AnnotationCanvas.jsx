import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Canvas, Control, Ellipse, FabricImage, Line, Path, PencilBrush, Rect, Textbox } from 'fabric';
import { getMostVisiblePageNumber } from '../viewer/viewerPageTracking';

// A4: color/fill/stroke-width are one *global* style, owned by ViewerPage.jsx
// (StyleControls.tsx) and passed in as the `style` prop — not per-tool, not
// hardcoded here. `HIGHLIGHTER_OPACITY` is the one exception: a highlighter's
// semi-transparency is a fixed, hardcoded property of that specific tool,
// not a setting either tool exposes, so it stays a constant here rather than
// part of `style` (this does not contradict A3 — see the note below).
const HIGHLIGHTER_OPACITY = 0.35;
const FREE_DRAWING_OPACITY = {
  pen: 1,
  'freeform-highlighter': HIGHLIGHTER_OPACITY,
};
const FREE_DRAWING_TOOLS = new Set(Object.keys(FREE_DRAWING_OPACITY));

// Below this size, in *screen* pixels — not this canvas's PDF-point units,
// which are zoom-dependent (`canvas.getScenePoint` divides by zoom, so a
// fixed logical-space threshold would let more incidental screen-pixel
// jitter through at low zoom and less at high zoom) — a drag-to-place
// gesture is treated as an accidental click, not a real shape, and
// discarded. Checked against `width/height * canvas.getZoom()`, i.e.
// converted back to screen space.
const MIN_DRAG_SIZE_SCREEN_PX = 4;

// Assumes a 6-digit `#rrggbb` string. `style.color` comes from an
// `<input type="color">` (StyleControls.tsx), which always emits that exact
// format, so this holds for every real caller today.
function withAlpha(hexColor, alpha) {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Tags every annotation object with which tool created it — this is what
// lets `applyStyleToObject` (re-selecting and restyling an existing
// annotation, A4's "unless re-selected" carve-out) know how to interpret
// `style.color`/`style.strokeWidth` for that specific object
// without re-deriving it from the object's current paint. Included in
// `canvas.toJSON()`'s `propertiesToInclude` (see `handlePagesReset`/
// `handlePageRendered`) so it survives PDFViewer's destructive per-scale
// canvas rebuilds, not just the object's lifetime within one canvas.
function tag(object, toolId) {
  object.set('annotationTool', toolId);
  return object;
}

// Text (A1) isn't free-drawing — it's click-to-place — but still needs the
// overlay's pointer-events enabled to receive that click.
const CLICK_TO_PLACE_TOOLS = new Set(['text']);

// Drag-to-place tools whose gesture is "drag out a bounding box" (as opposed
// to Line/Arrow's "drag between two points", below). Each entry says how to
// create the shape at zero size and how to resize it to a given box — same
// per-tool style-config shape as FREE_DRAWING_OPACITY, generalized to cover
// Rectangle/Ellipse/Cloud without three near-duplicate drag
// implementations. `resize` returns the shape to use going forward: most
// tools mutate `shape` in place and return the same instance, but Cloud's
// wavy outline is regenerated path data on every resize (same reasoning as
// Line/Arrow rebuilding on every move, below) and returns a *new* Path
// instead — the caller (updateBoundsDrag) swaps it into the canvas
// transparently either way. Closed shapes (Rectangle/Ellipse/Cloud) are
// outline-only — there is no fill option.
const BOUNDS_SHAPE_TOOLS = {
  rectangle: {
    create: (left, top, style) =>
      tag(new Rect({ left, top, originX: 'left', originY: 'top', width: 0, height: 0, fill: style.fill ?? null, stroke: style.color, strokeWidth: style.strokeWidth }), 'rectangle'),
    // Fabric 7 shapes default to a *center* origin (left/top = the center), so
    // origin is pinned to left/top above: the drag's start corner then stays
    // put. Width/height exclude the stroke, which is painted half inside and
    // half outside them, so the stroke is subtracted to keep the outline's
    // outer edge on the cursor.
    resize: (shape, left, top, width, height) => {
      shape.set({ left, top, width: Math.max(0, width - shape.strokeWidth), height: Math.max(0, height - shape.strokeWidth) });
      return shape;
    },
  },
  // Anchored like Rectangle: the press point is one corner of the ellipse's
  // bounding box (top-left origin, so left/top stay put) and the cursor is the
  // opposite corner.
  ellipse: {
    create: (left, top, style) =>
      tag(new Ellipse({ left, top, originX: 'left', originY: 'top', rx: 0, ry: 0, fill: style.fill ?? null, stroke: style.color, strokeWidth: style.strokeWidth }), 'ellipse'),
    // Ellipse's own width/height are derived from rx/ry, not settable
    // directly; the stroke is subtracted so the outline's outer edge fills the box.
    resize: (shape, left, top, width, height) => {
      shape.set({
        left,
        top,
        rx: Math.max(0, width - shape.strokeWidth) / 2,
        ry: Math.max(0, height - shape.strokeWidth) / 2,
      });
      return shape;
    },
  },
  cloud: {
    create: (left, top, style) => tag(buildCloudShape(left, top, 0, 0, style), 'cloud'),
    resize: (_shape, left, top, width, height, style) => tag(buildCloudShape(left, top, width, height, style), 'cloud'),
  },
};

const BOUNDS_SHAPE_TOOL_IDS = new Set(Object.keys(BOUNDS_SHAPE_TOOLS));

// Line and Arrow are drag-to-place too, but "drag between two points" rather
// than "drag out a bounding box" — a different enough gesture (direction
// matters, there's no "normalize to top-left corner") that it gets its own
// mechanism below rather than being forced into BOUNDS_SHAPE_TOOLS's shape.
const POINT_TO_POINT_TOOLS = new Set(['line', 'arrow']);

// Hand: no creation gesture at all — the overlay just takes pointer input so
// existing annotations can be selected, moved and resized.
const HAND_TOOL = 'hand';

// Once a drawing gesture finishes, the new annotation is selected and the
// toolbar drops back to Hand (via `canvas.__onObjectCreated`) so the next drag
// moves/resizes it instead of starting another one.
function finishCreation(canvas, object) {
  canvas.setActiveObject(object);
  canvas.requestRenderAll();
  canvas.__onObjectCreated?.();
}

// Trash button shown beside a selected annotation (a Fabric control, so it
// follows the object's move/resize/rotate). Clicking it asks ViewerPage for the
// same "Delete annotation?" confirmation the Delete key opens.
const TRASH_ICON_PATH = 'M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z';
const TRASH_BUTTON_RADIUS = 14;

function renderTrashControl(ctx, left, top, _styleOverride, fabricObject) {
  ctx.save();
  ctx.translate(left, top);
  ctx.rotate((fabricObject.angle * Math.PI) / 180);
  ctx.shadowColor = 'rgb(0 0 0 / 25%)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, TRASH_BUTTON_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  if (typeof Path2D !== 'undefined') {
    const scale = 0.75;
    ctx.scale(scale, scale);
    ctx.translate(-12, -12);
    ctx.fillStyle = '#dc2626';
    ctx.fill(new Path2D(TRASH_ICON_PATH));
  }
  ctx.restore();
}

function addDeleteControl(canvas, object) {
  if (object.controls?.deleteControl || object.selectable === false) return;
  // `controls` is shared by every object of a class — copy before adding.
  object.controls = {
    ...object.controls,
    deleteControl: new Control({
      x: 0.5,
      y: -0.5,
      offsetX: 24,
      offsetY: -24,
      cursorStyle: 'pointer',
      sizeX: TRASH_BUTTON_RADIUS * 2,
      sizeY: TRASH_BUTTON_RADIUS * 2,
      render: renderTrashControl,
      mouseUpHandler: () => {
        canvas.__onRequestDelete?.();
        return true;
      },
    }),
  };
}

const DRAG_TO_PLACE_TOOLS = new Set([...BOUNDS_SHAPE_TOOL_IDS, ...POINT_TO_POINT_TOOLS]);
const INTERACTIVE_TOOLS = new Set([
  ...FREE_DRAWING_TOOLS,
  ...CLICK_TO_PLACE_TOOLS,
  ...DRAG_TO_PLACE_TOOLS,
]);

// Arrow's head, in this canvas's PDF-point units — proportional to the
// current stroke width so it stays visually in proportion as that changes.
function arrowheadSize(style) {
  return { length: style.strokeWidth * 3, width: style.strokeWidth * 2.5 };
}

// A one-sided arrow (A2: arrowhead on one end only, at `end`): a single Path
// with two subpaths — the shaft (stopping short of the head so it doesn't
// poke out past the head's base) and a filled triangle. One object, not a
// Group, so it serializes/burns-in the same straightforward way every other
// shape here does. The arrowhead is always filled with `style.color`,
// since an arrow requires a filled head.
//
// The head is clamped to at most half the arrow's actual length. Without
// this, a drag shorter than the head's full length would walk `back` past
// `start` (on the far side of it, not between `start` and `end`) — an
// oversized head that swallows the whole line plus a shaft segment sticking
// out backward past where the user started dragging.
function buildArrowPath(start, end, style) {
  const { length: fullHeadLength, width: fullHeadWidth } = arrowheadSize(style);
  const totalLength = Math.hypot(end.x - start.x, end.y - start.y);
  const headLength = Math.min(fullHeadLength, totalLength / 2);
  const headWidth = fullHeadWidth * (headLength / fullHeadLength);

  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const backX = end.x - headLength * Math.cos(angle);
  const backY = end.y - headLength * Math.sin(angle);
  const perpX = -Math.sin(angle) * (headWidth / 2);
  const perpY = Math.cos(angle) * (headWidth / 2);

  const pathData = [
    `M ${start.x} ${start.y} L ${backX} ${backY}`,
    `M ${end.x} ${end.y} L ${backX + perpX} ${backY + perpY} L ${backX - perpX} ${backY - perpY} Z`,
  ].join(' ');

  return tag(new Path(pathData, { fill: style.color, stroke: style.color, strokeWidth: style.strokeWidth }), 'arrow');
}

function buildLineOrArrow(tool, start, end, style) {
  if (tool === 'arrow') return buildArrowPath(start, end, style);
  return tag(new Line([start.x, start.y, end.x, end.y], { stroke: style.color, strokeWidth: style.strokeWidth }), 'line');
}

// Cloud (A7): rectangle-based, wavy border — a closed loop of outward-bowed
// arcs around the drag's bounding box instead of straight edges. Bump count
// per side is however many whole CLOUD_BUMP_SIZE-ish chords fit that side
// (at least 1), so bumps stay a roughly consistent size regardless of the
// box's own size, rather than a fixed bump count stretching/squashing on a
// very wide or very narrow box.
const CLOUD_BUMP_SIZE = 20;

function buildCloudPathData(left, top, width, height) {
  // A truly zero-size cloud (right at mouse:down, before any drag) would
  // degenerate to zero-length sides (NaN arc radii) — floor only that exact
  // case at one bump's width, not any dimension smaller than a bump. A real
  // drag that's genuinely thin (e.g. bracketing a single line of text) must
  // render at its actual dragged size, not be inflated up to CLOUD_BUMP_SIZE
  // — unlike the zero case, that's a real user-intended shape, not a
  // placeholder, and Rectangle/Ellipse never inflate a thin real drag either.
  const w = width === 0 ? CLOUD_BUMP_SIZE : width;
  const h = height === 0 ? CLOUD_BUMP_SIZE : height;
  const corners = [
    [left, top],
    [left + w, top],
    [left + w, top + h],
    [left, top + h],
  ];

  const points = [];
  for (let i = 0; i < corners.length; i += 1) {
    const [x1, y1] = corners[i];
    const [x2, y2] = corners[(i + 1) % corners.length];
    const sideLength = Math.hypot(x2 - x1, y2 - y1);
    const bumpCount = Math.max(1, Math.round(sideLength / CLOUD_BUMP_SIZE));
    for (let b = 0; b < bumpCount; b += 1) {
      const t = b / bumpCount;
      points.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t });
    }
  }
  points.push(points[0]);

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    const p1 = points[i - 1];
    const p2 = points[i];
    const radius = Math.hypot(p2.x - p1.x, p2.y - p1.y) / 2;
    // sweep-flag 1: bows each arc outward for this loop's traversal
    // direction (clockwise in screen coordinates) — confirmed visually.
    d += ` A ${radius} ${radius} 0 0 1 ${p2.x} ${p2.y}`;
  }
  return d;
}

function buildCloudShape(left, top, width, height, style) {
  return new Path(buildCloudPathData(left, top, width, height), {
    fill: style.fill ?? null,
    stroke: style.color,
    strokeWidth: style.strokeWidth,
  });
}

const DEFAULT_TEXT_FONT_SIZE = 16;
const DEFAULT_TEXT_FONT_FAMILY = 'Helvetica';

// Signature (A8): unlike every other tool above, placement isn't a canvas
// gesture driven by `activeTool`/mouse events — SignatureUploader.tsx
// validates/re-encodes the file and hands the result to `addSignatureImage`
// (below) directly, via ViewerPage.jsx. A default width in PDF points (not
// the uploaded image's native pixel size, which could be thousands of
// pixels wide and swallow the whole page) keeps the placed signature a
// sensible, move/resize-from-here size regardless of what the user uploaded.
const DEFAULT_SIGNATURE_WIDTH_PT = 150;
// Clamped against the page's own width too, so a narrow page doesn't get an
// oversized default signature relative to its own content area.
const SIGNATURE_MAX_WIDTH_FRACTION_OF_PAGE = 0.5;
// Signatures conventionally sit near the bottom of a page; this is just the
// default placement — like every other tool's output, it's a normal
// selectable/movable/resizable Fabric object once placed (Fabric's own
// built-in selection/transform handles, not anything special-cased here).
const SIGNATURE_BOTTOM_MARGIN_PT = 40;

// A Textbox mid-edit doesn't get cleaned up (its `editing:exited` listener,
// which removes it if left empty, only fires from Fabric's own on-canvas
// deselect handling) when the user clicks something *outside* the canvas
// entirely — a zoom/fit-width button, a different toolbar tool. Both of
// those still need to force it closed: a zoom click is about to serialize
// this canvas's state (`handlePagesReset`, below) and would otherwise
// permanently persist an empty, invisible, unremovable annotation across
// the rescale; a tool switch would otherwise leave a stray editing cursor
// live until the next canvas click.
function exitActiveEditing(canvas) {
  const active = canvas.getActiveObject();
  if (active?.isEditing) active.exitEditing();
}

function applyActiveTool(canvas, activeTool, style) {
  const isFreeDrawing = FREE_DRAWING_TOOLS.has(activeTool);
  canvas.isDrawingMode = isFreeDrawing;
  if (isFreeDrawing) {
    if (!canvas.freeDrawingBrush) canvas.freeDrawingBrush = new PencilBrush(canvas);
    // Bake opacity into the *live* brush color so the in-progress stroke
    // previews at the right transparency while dragging (Fabric paints the
    // live drag to a separate top context, at the brush's raw color, and
    // only creates the real Path object on mouse-up) — path:created below
    // then resets the finished object back to a solid stroke + a real
    // `opacity` property, so both the live preview and the serialized state
    // are correct, not just one or the other.
    canvas.freeDrawingBrush.color = withAlpha(style.color, FREE_DRAWING_OPACITY[activeTool]);
    canvas.freeDrawingBrush.width = style.strokeWidth;
    // All line-based marks render solid only (A2) — never set strokeDashArray.
    // Side effect worth knowing about, not a bug: Fabric's PencilBrush switches
    // to a "clear + fully redraw the stroke so far on every mouse:move" path
    // (its needsFullRender() check) whenever the brush color's alpha is < 1 —
    // i.e. only for Freeform Highlighter, not Pen. That's Fabric's own
    // built-in fix for a translucent stroke self-overlapping and double-
    // darkening at the overlap, so it's desirable, not a regression — it just
    // means Highlighter is inherently a little heavier on long drags than Pen.
  }

  // Keep the overlay out of the way of pan/zoom-controls clicks unless the
  // active tool actually needs pointer input. `lowerCanvasEl` never needs
  // pointer input — Fabric never attaches listeners to it — set once at
  // canvas creation, not part of this toggle.
  canvas.upperCanvasEl.style.pointerEvents =
    INTERACTIVE_TOOLS.has(activeTool) || activeTool === HAND_TOOL ? 'auto' : 'none';

  // Fabric's own default behavior for a drag starting on empty canvas is a
  // multi-select marquee — every one of our custom tools takes over that
  // same drag gesture for its own purpose, so it must never compete with it.
  canvas.selection = !INTERACTIVE_TOOLS.has(activeTool);
}

// A4's "unless re-selected": re-applying the current global style to
// whichever object is presently selected, live, without needing to place a
// new annotation. Reuses the same tool-id tag every creation path already
// sets, so this needs no per-object-type detection logic of its own.
function applyStyleToObject(object, style) {
  const tool = object.annotationTool;
  if (tool === 'text') {
    // Text's color lives in `fill`.
    object.set({
      fill: style.color,
      fontFamily: style.fontFamily ?? DEFAULT_TEXT_FONT_FAMILY,
      fontSize: style.fontSize ?? DEFAULT_TEXT_FONT_SIZE,
    });
  } else if (tool === 'arrow') {
    object.set({ fill: style.color, stroke: style.color, strokeWidth: style.strokeWidth });
  } else if (tool === 'pen' || tool === 'freeform-highlighter' || tool === 'line') {
    // These are strokes (PencilBrush/Line output) — color lives in `stroke`,
    // not `fill`, unlike Text above.
    object.set({ stroke: style.color, strokeWidth: style.strokeWidth });
  } else if (tool === 'rectangle' || tool === 'ellipse' || tool === 'cloud') {
    object.set({ stroke: style.color, strokeWidth: style.strokeWidth, fill: style.fill ?? null });
  }
}

// Places a Textbox at the clicked point (already in this canvas's own PDF-
// point coordinate space — `canvas.getScenePoint` accounts for the current
// zoom, so no manual scale math is needed here, same Risk R1 guarantee as
// everything else in this file) and drops the user straight into editing it.
function placeTextbox(canvas, screenEvent, style) {
  const point = canvas.getScenePoint(screenEvent);
  const textbox = tag(
    new Textbox('', { left: point.x, top: point.y, fontSize: style.fontSize ?? DEFAULT_TEXT_FONT_SIZE, fontFamily: style.fontFamily ?? DEFAULT_TEXT_FONT_FAMILY, fill: style.color }),
    'text',
  );
  canvas.add(textbox);
  canvas.setActiveObject(textbox);
  textbox.enterEditing();
  textbox.selectAll();

  // A box the user clicked away from without typing anything shouldn't
  // linger as an empty, selectable-but-invisible annotation.
  textbox.on('editing:exited', () => {
    if (!textbox.text.trim()) {
      canvas.remove(textbox);
      canvas.requestRenderAll();
    }
  });

  canvas.requestRenderAll();
}

// Bounding-box drag-to-place (Rectangle, Ellipse, Cloud):
// `canvas.__boundsDrag` tracks the in-progress drag between mouse:down and
// mouse:move/mouse:up (same start/finish-at-different-events shape as
// free-drawing's `__strokeTool`, just for a shape instead of a path). Width/
// height are tracked on the drag state itself, not read back off the shape,
// since not every shape type stores its own size the same way (Ellipse's
// `.width`/`.height` are derived from `rx`/`ry`, confirmed empirically —
// reading them back would work too, but tracking directly is shape-agnostic).
// `style` is captured once, at drag-start, and reused for every resize during
// that same drag — not re-read live — so a style change made mid-drag (e.g.
// via keyboard focus on the stroke-width input while the mouse is still held
// down) can't retroactively change a shape that's already being drawn, the
// same reasoning `__strokeTool` already applies to free-drawing strokes.
function startBoundsDrag(canvas, tool, screenEvent, style) {
  const start = canvas.getScenePoint(screenEvent);
  const shape = BOUNDS_SHAPE_TOOLS[tool].create(start.x, start.y, style);
  canvas.add(shape);
  canvas.__boundsDrag = { tool, start, shape, style, width: 0, height: 0 };
}

function updateBoundsDrag(canvas, screenEvent) {
  const dragState = canvas.__boundsDrag;
  if (!dragState) return;
  const { tool, start, shape, style } = dragState;
  const current = canvas.getScenePoint(screenEvent);
  const left = Math.min(start.x, current.x);
  const top = Math.min(start.y, current.y);
  const width = Math.abs(current.x - start.x);
  const height = Math.abs(current.y - start.y);
  const nextShape = BOUNDS_SHAPE_TOOLS[tool].resize(shape, left, top, width, height, style);
  if (nextShape !== shape) {
    canvas.remove(shape);
    canvas.add(nextShape);
    dragState.shape = nextShape;
  }
  dragState.width = width;
  dragState.height = height;
  canvas.requestRenderAll();
}

function finishBoundsDrag(canvas) {
  const dragState = canvas.__boundsDrag;
  canvas.__boundsDrag = null;
  if (!dragState) return;
  const { shape, width, height } = dragState;
  // A drag too small to be a real shape is an accidental click, not
  // something the user actually wanted to keep. Convert back to screen
  // pixels before comparing — see MIN_DRAG_SIZE_SCREEN_PX's comment.
  const zoom = canvas.getZoom();
  if (width * zoom < MIN_DRAG_SIZE_SCREEN_PX || height * zoom < MIN_DRAG_SIZE_SCREEN_PX) {
    canvas.remove(shape);
    canvas.requestRenderAll();
    return;
  }
  shape.setCoords();
  finishCreation(canvas, shape);
}

// Point-to-point drag-to-place (Line, Arrow): rebuilds the shape from
// scratch on every move rather than mutating it in place. Line's own x1/y1/
// x2/y2 + setCoords() do support live mutation (confirmed empirically), but
// Arrow's geometry (a compound Path) doesn't have an equivalent "just move
// the endpoint" API without reaching into Fabric's path-parsing internals —
// rebuilding both the same way keeps this one mechanism instead of two, and
// an interactive drag creates at most a few dozen short-lived objects, not a
// performance concern. `style` is captured at drag-start, same reasoning as
// startBoundsDrag's comment above.
function startLineDrag(canvas, tool, screenEvent, style) {
  const start = canvas.getScenePoint(screenEvent);
  const shape = buildLineOrArrow(tool, start, start, style);
  canvas.add(shape);
  canvas.__lineDrag = { tool, start, current: start, shape, style };
}

function updateLineDrag(canvas, screenEvent) {
  const dragState = canvas.__lineDrag;
  if (!dragState) return;
  const { tool, start, shape, style } = dragState;
  const current = canvas.getScenePoint(screenEvent);
  canvas.remove(shape);
  const nextShape = buildLineOrArrow(tool, start, current, style);
  canvas.add(nextShape);
  dragState.shape = nextShape;
  dragState.current = current;
  canvas.requestRenderAll();
}

function finishLineDrag(canvas) {
  const dragState = canvas.__lineDrag;
  canvas.__lineDrag = null;
  if (!dragState) return;
  const { shape, start, current } = dragState;
  const zoom = canvas.getZoom();
  const lengthScreenPx = Math.hypot(current.x - start.x, current.y - start.y) * zoom;
  if (lengthScreenPx < MIN_DRAG_SIZE_SCREEN_PX) {
    canvas.remove(shape);
    canvas.requestRenderAll();
    return;
  }
  shape.setCoords();
  finishCreation(canvas, shape);
}

// Abandons whatever gesture is mid-flight that this file guards against
// surviving a reset or tool switch (currently in-progress text editing).
// Does NOT cover
// `canvas.__boundsDrag`/`__lineDrag` (a pre-existing gap, not introduced
// here): those drag gestures live entirely within one continuous
// mouse-down-to-mouse-up span, so they can't straddle a tool switch or a
// reset the way multi-click/mid-edit gestures can.
function cancelPendingGestures(canvas) {
  exitActiveEditing(canvas);
}

// A6: Delete/Backspace on a selected annotation opens a confirmation modal
// (owned by ViewerPage.jsx, via `onRequestDelete`) rather than deleting
// immediately — the actual removal only happens if the caller later invokes
// `deleteActiveObject()` on this component's ref, once the user confirms.
// Only one canvas (one page) can realistically have a live selection at a
// time in normal use (selecting on another page doesn't call
// `discardActiveObject` on this one, a pre-existing gap unrelated to this
// feature — see the A5 selection-fix comments below), so "the" selected
// annotation is simply the first one found while walking every tracked page
// canvas, not something this component needs to track as its own extra
// piece of state.
function getSelectedAnnotation(canvasesMap) {
  for (const canvas of canvasesMap.values()) {
    const active = canvas.getActiveObject();
    if (active) return { canvas, active };
  }
  return null;
}

// Guards the Delete/Backspace listener below against two unrelated cases
// that must NOT open the delete-confirmation modal: (1) the user is typing
// Backspace into an ordinary form control (e.g. the stroke-width input,
// SignatureUploader's error text isn't focusable but a future filename
// field would be) that merely happens to share the keyboard shortcut: (2) a
// Textbox annotation is currently mid-edit — Fabric's IText/Textbox
// implementation moves focus to its own offscreen `hiddenTextarea` while
// editing, so checking `document.activeElement`'s tag also covers this case
// for free, without this file needing to separately check the active
// object's `isEditing` flag.
function isEditableElementFocused() {
  const el = document.activeElement;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

// PDFViewer.tsx owns the actual page DOM and rebuilds it wholesale on every
// zoom/document change (it has no stable per-page DOM to attach to across
// scale changes). Rather than guessing at that timing via a MutationObserver,
// PDFViewer.tsx calls back into this component's imperative handle exactly
// when a page's DOM is ready (`handlePageRendered`) and exactly when the
// current page DOM is about to be torn down (`handlePagesReset`) — see
// ViewerPage.jsx for the wiring. This lets a Fabric canvas be attached,
// reattached at the new on-screen size, or disposed without racing PDFViewer.
//
// Each page's Fabric canvas is created at the page's *native* (scale: 1) PDF
// point dimensions and kept there for its whole life — only `setZoom`/
// `setDimensions` change when the on-screen scale changes. That means every
// annotation object's own coordinates (`left`/`top`/etc.) always stay in PDF
// point space, never screen-pixel space, which is what keeps burn-in position
// matching the on-screen position at any zoom level (Risk R1).
// `attachmentId` isn't used yet — kept in the signature for the save/load
// wiring in task 3.x (persisting/loading the annotation JSON per attachment).
const AnnotationCanvas = forwardRef(function AnnotationCanvas({ attachmentId, pdfDoc, activeTool, style, onRequestDelete, onObjectCreated }, ref) {
  const canvasesRef = useRef(new Map()); // pageNumber -> fabric.Canvas
  const savedStateRef = useRef(new Map()); // pageNumber -> fabric JSON (PDF point coords)
  const pdfDocRef = useRef(pdfDoc);
  // "Latest ref" pattern (same convention as PDFViewer.tsx): handlePageRendered
  // is async and called imperatively from outside React's render flow, so it
  // needs the tool/style that's active *now*, not whatever was active when
  // its own invocation started.
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;
  const styleRef = useRef(style);
  styleRef.current = style;
  // Same "latest ref" reasoning: the document-level keydown listener below
  // is attached once, on mount, so it needs whichever `onRequestDelete` is
  // current at keypress time, not whatever was passed in on that first mount.
  const onRequestDeleteRef = useRef(onRequestDelete);
  onRequestDeleteRef.current = onRequestDelete;
  const onObjectCreatedRef = useRef(onObjectCreated);
  onObjectCreatedRef.current = onObjectCreated;

  if (pdfDocRef.current !== pdfDoc) {
    // A genuinely different document — nothing to carry forward.
    savedStateRef.current = new Map();
    pdfDocRef.current = pdfDoc;
  }

  // Switching tools force-exits any in-progress text editing (see
  // exitActiveEditing's comment) — but a style change alone must not,
  // or touching a color/fill/stroke-width control mid-gesture would
  // interrupt it (and, for an empty text box, delete it outright via the
  // same `editing:exited` cleanup). Kept as its own effect, keyed on
  // `[activeTool]` only, so it never re-runs for a `style` change.
  useEffect(() => {
    canvasesRef.current.forEach((canvas) => cancelPendingGestures(canvas));
  }, [activeTool]);

  useEffect(() => {
    canvasesRef.current.forEach((canvas) => applyActiveTool(canvas, activeTool, style));
  }, [activeTool, style]);

  // A6: Delete/Backspace on a selected annotation requests confirmation
  // rather than deleting outright — attached to `document`, not any one
  // canvas element, since a plain `<canvas>` isn't focusable by default and
  // this needs to fire regardless of which page's canvas the user last
  // clicked on. `preventDefault()` only once a real deletable selection is
  // found: Backspace with nothing focused is the browser's own "navigate
  // back" shortcut in some browsers, so letting it through in every other
  // case (nothing selected, or a real form control focused, per
  // `isEditableElementFocused`) preserves that.
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (isEditableElementFocused()) return;
      if (!getSelectedAnnotation(canvasesRef.current)) return;

      event.preventDefault();
      onRequestDeleteRef.current?.();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // A4's "unless re-selected": if the user has an annotation selected right
  // now, changing the global style also restyles that object live, not just
  // whatever gets placed next.
  // Skipped when the tool itself changed: each tool has its own style, so a
  // tool switch swaps `style` without the user editing it and must not repaint
  // the selection.
  const styledToolRef = useRef(activeTool);
  useEffect(() => {
    if (styledToolRef.current !== activeTool) {
      styledToolRef.current = activeTool;
      return;
    }
    canvasesRef.current.forEach((canvas) => {
      const active = canvas.getActiveObject();
      if (!active) return;
      applyStyleToObject(active, style);
      canvas.requestRenderAll();
    });
  }, [style]);

  useImperativeHandle(
    ref,
    () => ({
      // Exposes the underlying Fabric canvas for a page — needed by future
      // tool wiring (2.4+, to enable drawing mode / add objects) and by tests.
      // Two things future callers must not do: (1) call `.dispose()` on the
      // returned instance themselves — this component doesn't know it's been
      // disposed and will still try to use it later; go through
      // `handlePagesReset`/a new page render instead. (2) add an object using
      // screen-space coordinates (e.g. straight from a click event) — objects
      // must be added in this canvas's own logical PDF-point space, since
      // that's what keeps burn-in position matching the on-screen position
      // at any zoom level (Risk R1). Use `canvas.getZoom()` (or an
      // `addObjectAtScreenPoint`-style helper, if one gets added later) to
      // convert first.
      getCanvas(pageNumber) {
        return canvasesRef.current.get(pageNumber) ?? null;
      },

      // A6: called by ViewerPage.jsx only after the user confirms the
      // "Delete annotation?" modal — never on the initial Delete/Backspace
      // press itself (see the keydown effect above, which only *requests*
      // confirmation). Re-finds the selected annotation at call time rather
      // than trusting anything captured when the key was pressed, since the
      // confirmation modal is a separate, later UI interaction. Returns
      // whether anything was actually removed, so a caller could tell "the
      // selection went away before confirming" apart from "delete
      // succeeded" if that ever mattered.
      deleteActiveObject() {
        const found = getSelectedAnnotation(canvasesRef.current);
        if (!found) return false;

        const { canvas, active } = found;
        canvas.discardActiveObject();
        canvas.remove(active);
        canvas.requestRenderAll();
        return true;
      },

      // Called by ViewerPage.jsx once SignatureUploader.tsx has validated and
      // re-encoded an uploaded image. `source` is a canvas element (Fabric's
      // Image accepts a canvas or an img as its drawable source, and
      // serializes a canvas source via `toDataURL()`, so no separate decode
      // step is needed here — see SignatureUploader.tsx's own comments for
      // why re-encoding happens there, before this call, rather than here).
      // Places onto whichever page is currently most visible on screen —
      // same DOM-based lookup PageNavigator.tsx uses for "current page",
      // rather than this component tracking its own copy of that state.
      // Returns whether the image was actually placed, so ViewerPage.jsx can
      // surface a visible error (via SignatureUploader.tsx's own error slot)
      // instead of the file picker silently closing with nothing happening —
      // a real, reachable case: this tool is available before the first page
      // has finished rendering, since Toolbar.jsx doesn't gate on `pdfDoc`/
      // `loading`.
      addSignatureImage(source, naturalWidth, naturalHeight) {
        if (naturalWidth <= 0 || naturalHeight <= 0) return false;

        const viewerContainer = document.querySelector('.pdf-viewer');
        const targetPage = viewerContainer
          ? getMostVisiblePageNumber(viewerContainer)
          : canvasesRef.current.keys().next().value ?? null;
        const canvas = targetPage != null ? canvasesRef.current.get(targetPage) : null;
        if (!canvas) return false;

        // The canvas's own `.width`/`.height` are screen pixels (set by
        // `setDimensions` in handlePageRendered, below) — dividing out the
        // current zoom recovers this page's native PDF-point dimensions,
        // the same space every object on it is positioned in (Risk R1).
        const zoom = canvas.getZoom();
        const pageWidthPt = canvas.width / zoom;
        const pageHeightPt = canvas.height / zoom;

        const targetWidth = Math.min(DEFAULT_SIGNATURE_WIDTH_PT, pageWidthPt * SIGNATURE_MAX_WIDTH_FRACTION_OF_PAGE);
        const scale = targetWidth / naturalWidth;
        const targetHeight = naturalHeight * scale;

        const image = tag(
          new FabricImage(source, {
            // Fabric's own object default is origin 'center' (its `left`/
            // `top` mean the object's *center*, not its top-left corner) —
            // pinned to 'left'/'top' here so the position computed above
            // (top-left of the box the image should occupy) means what it
            // says.
            originX: 'left',
            originY: 'top',
            left: (pageWidthPt - targetWidth) / 2,
            top: Math.max(0, pageHeightPt - targetHeight - SIGNATURE_BOTTOM_MARGIN_PT),
            scaleX: scale,
            scaleY: scale,
          }),
          'signature',
        );
        canvas.add(image);
        canvas.setActiveObject(image);
        canvas.requestRenderAll();
        return true;
      },

      // Task 3.x (burn-in/download/save): collects every page's annotation
      // objects, in this canvas's own PDF-point coordinate space (Risk R1 —
      // no conversion needed, the server burns them in at face value). Live
      // canvases (currently on screen) are read fresh via toJSON() rather
      // than from `savedStateRef`, since a page's savedStateRef entry is only
      // refreshed on teardown (handlePagesReset/a page-render replacing it) —
      // reading it here instead would miss an edit made since the last
      // zoom/pan. Pages that have been visited before but aren't currently
      // mounted (savedStateRef only) are included from there; a page never
      // visited has no entry either way, which is correct — nothing could
      // have been drawn on it. Pages with zero objects are omitted so the
      // server doesn't need to special-case an empty `objects` array.
      getAnnotationsForBurnIn() {
        const pages = [];
        const seenPages = new Set();

        canvasesRef.current.forEach((canvas, pageNumber) => {
          cancelPendingGestures(canvas);
          const json = canvas.toJSON(['annotationTool']);
          seenPages.add(pageNumber);
          if (json.objects && json.objects.length > 0) {
            pages.push({ pageNumber, objects: json.objects });
          }
        });

        savedStateRef.current.forEach((json, pageNumber) => {
          if (seenPages.has(pageNumber)) return;
          if (json.objects && json.objects.length > 0) {
            pages.push({ pageNumber, objects: json.objects });
          }
        });

        return pages.sort((a, b) => a.pageNumber - b.pageNumber);
      },

      handlePagesReset() {
        canvasesRef.current.forEach((canvas, pageNumber) => {
          // Must run before toJSON() — see cancelPendingGestures's comment.
          cancelPendingGestures(canvas);
          savedStateRef.current.set(pageNumber, canvas.toJSON(['annotationTool']));
          canvas.dispose();
        });
        canvasesRef.current.clear();
      },

      async handlePageRendered(pageNumber, pageWrapper, pdfCanvasEl) {
        const doc = pdfDocRef.current;
        if (!doc) return;

        const existing = canvasesRef.current.get(pageNumber);
        if (existing) {
          cancelPendingGestures(existing);
          savedStateRef.current.set(pageNumber, existing.toJSON(['annotationTool']));
          existing.dispose();
          canvasesRef.current.delete(pageNumber);
        }

        const page = await doc.getPage(pageNumber);
        // Bail if a newer document has since loaded, or if PDFViewer already
        // tore this page's wrapper down (e.g. a rescale that landed while this
        // call was still awaiting getPage) — otherwise this stale call would
        // dispose the *correct*, already-attached canvas a later call just
        // built, and replace it in the tracking map with one attached to a
        // detached DOM node.
        if (pdfDocRef.current !== doc || !pageWrapper.isConnected) return;

        const nativeViewport = page.getViewport({ scale: 1 });

        const overlayEl = document.createElement('canvas');
        overlayEl.className = 'annotation-overlay-canvas';
        pageWrapper.appendChild(overlayEl);

        const canvas = new Canvas(overlayEl, {
          width: nativeViewport.width,
          height: nativeViewport.height,
          selection: true,
        });

        canvas.__onObjectCreated = () => onObjectCreatedRef.current?.();
        canvas.__onRequestDelete = () => onRequestDeleteRef.current?.();
        canvas.on('object:added', ({ target }) => addDeleteControl(canvas, target));

        // While an interactive tool is active, a pointerdown on this canvas
        // must go to Fabric, not also start PDFViewer.tsx's pan gesture on
        // the ancestor `.pdf-viewer` (which calls setPointerCapture — once
        // captured, even Fabric's *mouse* events, which is what it actually
        // listens for, get redirected to the capturing element per the
        // Pointer Events spec's compatibility-event rules, breaking both
        // drawing and click-to-place). Checked live via `activeToolRef`, not
        // captured at attach time, so it stays correct across tool changes.
        canvas.upperCanvasEl.addEventListener('pointerdown', (event) => {
          if (INTERACTIVE_TOOLS.has(activeToolRef.current)) event.stopPropagation();
          // Hand: only claim the pointer when grabbing an annotation, so
          // dragging empty page area still pans the viewer.
          if (activeToolRef.current === HAND_TOOL && canvas.findTarget(event).target) event.stopPropagation();

          // A5: clicking any placed annotation must select it, even while
          // Pen/Freeform Highlighter is active. Fabric's own `isDrawingMode`
          // mousedown handling (`__onMouseDown`, driven by the *mousedown*
          // event Fabric listens for — see the class comment above this
          // file's imports) skips its normal target hit-testing/selection
          // entirely and always starts a brush stroke, by design, since
          // every other pixel of the canvas should draw, not select. This
          // runs on `pointerdown`, not `mousedown`: for a real pointer
          // input, the browser always fully dispatches `pointerdown` before
          // it synthesizes the following `mousedown` for the same click, so
          // flipping `isDrawingMode` off here reliably lands before Fabric's
          // own mousedown handler ever runs — letting its normal
          // (non-drawing) path select `target` and set up its drag/resize
          // transform instead. Restored on `mouse:up`, not immediately, so
          // the whole drag/resize gesture runs with drawing mode off, not
          // just the initial click. Also depends on the `stopPropagation()`
          // just above already blocking PDFViewer.tsx's pan-gesture
          // `preventDefault()` from running on this same event when zoomed
          // in — see that comment; without it, this event would never reach
          // this point at all while panning is possible.
          if (canvas.isDrawingMode) {
            const { target } = canvas.findTarget(event);
            if (target && target.selectable !== false) {
              canvas.isDrawingMode = false;
              canvas.__drawingModeSuspendedForSelection = true;
            } else if (canvas.getActiveObject()) {
              // Fabric's drawing-mode mousedown path never calls
              // `discardActiveObject` the way its normal path does, so
              // without this, starting a new stroke elsewhere would leave a
              // previously selected object's handles stuck on screen.
              canvas.discardActiveObject();
              canvas.requestRenderAll();
            }
          }
        });
        // Set once: this canvas never needs to receive pointer input itself
        // (Fabric only ever attaches listeners to upperCanvasEl), independent
        // of which tool is active.
        canvas.lowerCanvasEl.style.pointerEvents = 'none';

        // A stroke can take real time to draw; the active tool/style could
        // change mid-stroke (e.g. Tab-focus + Enter on a toolbar button
        // while the mouse is still held down elsewhere). Capture both when
        // the stroke *starts*, and use that in path:created — not whatever's
        // active when the mouse happens to come up — so a stroke drawn as
        // Pen at red can't retroactively get tagged as the Highlighter's or
        // repainted to a color picked after the fact.
        canvas.on('path:created', ({ path }) => {
          const tool = canvas.__strokeTool;
          const strokeStyle = canvas.__strokeStyle;
          const opacity = FREE_DRAWING_OPACITY[tool];
          if (opacity !== undefined && strokeStyle) {
            path.set({ stroke: strokeStyle.color, opacity });
            tag(path, tool);
            finishCreation(canvas, path);
          }
          canvas.requestRenderAll();
        });

        canvas.on('mouse:down', (event) => {
          const tool = activeToolRef.current;
          const currentStyle = styleRef.current;

          canvas.__strokeTool = tool;
          canvas.__strokeStyle = currentStyle;

          // Clicking an existing object (e.g. an already-placed text box or
          // highlight) should select/move it (or, for a text box already
          // selected, enter editing on this second click — Fabric's own
          // IText/Textbox behavior, not something this file drives) instead
          // of placing a new one on top of it.
          if (event.target) return;

          if (tool === 'text') {
            placeTextbox(canvas, event.e, currentStyle);
          } else if (BOUNDS_SHAPE_TOOL_IDS.has(tool) && !canvas.__boundsDrag) {
            startBoundsDrag(canvas, tool, event.e, currentStyle);
          } else if (POINT_TO_POINT_TOOLS.has(tool) && !canvas.__lineDrag) {
            startLineDrag(canvas, tool, event.e, currentStyle);
          }
        });

        canvas.on('mouse:move', (event) => {
          updateBoundsDrag(canvas, event.e);
          updateLineDrag(canvas, event.e);
        });

        canvas.on('mouse:up', (event) => {
          // Apply the release position too — the last mouse:move can lag it.
          if (event?.e) updateBoundsDrag(canvas, event.e);
          finishBoundsDrag(canvas);
          finishLineDrag(canvas);
          if (canvas.__drawingModeSuspendedForSelection) {
            canvas.isDrawingMode = true;
            canvas.__drawingModeSuspendedForSelection = false;
          }
        });

        // The PDF canvas's bitmap is in device pixels (PDFViewer renders at
        // devicePixelRatio); its CSS size is the on-screen size Fabric needs.
        const screenWidth = parseFloat(pdfCanvasEl.style.width) || pdfCanvasEl.width;
        const screenHeight = parseFloat(pdfCanvasEl.style.height) || pdfCanvasEl.height;
        const scale = nativeViewport.width > 0 ? screenWidth / nativeViewport.width : 1;
        canvas.setDimensions({ width: screenWidth, height: screenHeight });
        canvas.setZoom(scale);

        const savedJson = savedStateRef.current.get(pageNumber);
        if (savedJson) {
          await canvas.loadFromJSON(savedJson);
        }
        // Applied after loadFromJSON (not just before) in case restoring
        // objects ever touches canvas-level interaction state.
        applyActiveTool(canvas, activeToolRef.current, styleRef.current);
        canvas.requestRenderAll();

        canvasesRef.current.set(pageNumber, canvas);
      },
    }),
    [],
  );

  // Nothing of its own to render — every canvas is attached directly into
  // PDFViewer's page DOM via the imperative handle above.
  return null;
});

export default AnnotationCanvas;
