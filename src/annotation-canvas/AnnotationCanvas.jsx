import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Canvas, Ellipse, Line, Path, PencilBrush, Rect, Textbox } from 'fabric';

// Global style (A4) — color default red, stroke width default 4pt; every
// free-drawing tool shares this base color/width. StyleControls (task 2.10)
// will make color/width user-configurable; until then these are constants.
// Fabric's stroke `width` is in this canvas's own logical units, which are
// PDF points (see the coordinate-space note below), so "4pt" is simply `4`.
//
// Per-tool `opacity` is NOT the same thing as A3's "opacity fixed at 100%,
// not configurable" — A3 means there is no user-facing opacity *control* for
// line-based marks (A2, e.g. Pen). A highlighter's semi-transparency is a
// fixed, hardcoded property of that specific tool, not a setting either tool
// exposes — so both rules hold at once. Applied to the finished object
// (`path:created`/`finishHighlightDrag`, below), not baked into the brush's
// or fill's color string, so it stays a real `opacity` property in the
// serialized/burned-in state.
const BASE_STROKE_COLOR = '#dc2626';
const BASE_STROKE_WIDTH = 4;
const HIGHLIGHTER_OPACITY = 0.35;
const TOOL_BRUSH_STYLES = {
  pen: { opacity: 1 },
  'freeform-highlighter': { opacity: HIGHLIGHTER_OPACITY },
};
const FREE_DRAWING_TOOLS = new Set(Object.keys(TOOL_BRUSH_STYLES));

// Below this size, in *screen* pixels — not this canvas's PDF-point units,
// which are zoom-dependent (`canvas.getScenePoint` divides by zoom, so a
// fixed logical-space threshold would let more incidental screen-pixel
// jitter through at low zoom and less at high zoom) — a drag-to-place
// gesture is treated as an accidental click, not a real shape, and
// discarded. Checked against `rect.width/height * canvas.getZoom()`, i.e.
// converted back to screen space, in finishHighlightDrag.
const MIN_DRAG_SIZE_SCREEN_PX = 4;

// Assumes a 6-digit `#rrggbb` string — fine while the only caller is the
// hardcoded BASE_STROKE_COLOR constant below, but task 2.10's global color
// picker will feed a user-chosen value through this same path; a shorthand
// hex (`#f00`) or any other format would silently produce `rgba(NaN, NaN,
// NaN, x)` (an invisible stroke, no error) rather than failing loudly —
// validate/normalize the picker's output before it reaches here.
function withAlpha(hexColor, alpha) {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Text (A1) isn't free-drawing — it's click-to-place — but still needs the
// overlay's pointer-events enabled to receive that click.
const CLICK_TO_PLACE_TOOLS = new Set(['text']);

// Drag-to-place tools whose gesture is "drag out a bounding box" (as opposed
// to Line/Arrow's "drag between two points", below). Each entry says how to
// create the shape at zero size and how to resize it to a given box — same
// per-tool style-config shape as TOOL_BRUSH_STYLES, generalized to cover
// Rectangle/Ellipse/Cloud/Text Highlighter without four near-duplicate drag
// implementations. `resize` returns the shape to use going forward: most
// tools mutate `shape` in place and return the same instance, but Cloud's
// wavy outline is regenerated path data on every resize (same reasoning as
// Line/Arrow rebuilding on every move, below) and returns a *new* Path
// instead — the caller (updateBoundsDrag) swaps it into the canvas
// transparently either way. `fill: null` (Rectangle/Ellipse/Cloud) means
// A4's "fill default transparent" — an outline only, letting the page show
// through.
const BOUNDS_SHAPE_TOOLS = {
  'text-highlighter': {
    create: (left, top) => new Rect({ left, top, width: 0, height: 0, fill: BASE_STROKE_COLOR, opacity: HIGHLIGHTER_OPACITY, stroke: null }),
    resize: (shape, left, top, width, height) => {
      shape.set({ left, top, width, height });
      return shape;
    },
  },
  rectangle: {
    create: (left, top) => new Rect({ left, top, width: 0, height: 0, fill: null, stroke: BASE_STROKE_COLOR, strokeWidth: BASE_STROKE_WIDTH }),
    resize: (shape, left, top, width, height) => {
      shape.set({ left, top, width, height });
      return shape;
    },
  },
  ellipse: {
    create: (left, top) => new Ellipse({ left, top, rx: 0, ry: 0, fill: null, stroke: BASE_STROKE_COLOR, strokeWidth: BASE_STROKE_WIDTH }),
    // Ellipse's own width/height are derived from rx/ry (confirmed empirically
    // — setting rx/ry keeps .width/.height in sync), not settable directly.
    resize: (shape, left, top, width, height) => {
      shape.set({ left, top, rx: width / 2, ry: height / 2 });
      return shape;
    },
  },
  cloud: {
    create: (left, top) => buildCloudShape(left, top, 0, 0),
    resize: (_shape, left, top, width, height) => buildCloudShape(left, top, width, height),
  },
};

const BOUNDS_SHAPE_TOOL_IDS = new Set(Object.keys(BOUNDS_SHAPE_TOOLS));

// Line and Arrow are drag-to-place too, but "drag between two points" rather
// than "drag out a bounding box" — a different enough gesture (direction
// matters, there's no "normalize to top-left corner") that it gets its own
// mechanism below rather than being forced into BOUNDS_SHAPE_TOOLS's shape.
const POINT_TO_POINT_TOOLS = new Set(['line', 'arrow']);

const DRAG_TO_PLACE_TOOLS = new Set([...BOUNDS_SHAPE_TOOL_IDS, ...POINT_TO_POINT_TOOLS]);
const INTERACTIVE_TOOLS = new Set([...FREE_DRAWING_TOOLS, ...CLICK_TO_PLACE_TOOLS, ...DRAG_TO_PLACE_TOOLS]);

// Arrow's head, in this canvas's PDF-point units — proportional to the base
// stroke width so it stays visually in proportion if that constant changes.
const ARROWHEAD_LENGTH = BASE_STROKE_WIDTH * 3;
const ARROWHEAD_WIDTH = BASE_STROKE_WIDTH * 2.5;

// A one-sided arrow (A2: arrowhead on one end only, at `end`): a single Path
// with two subpaths — the shaft (stopping short of the head so it doesn't
// poke out past the head's base) and a filled triangle. One object, not a
// Group, so it serializes/burns-in the same straightforward way every other
// shape here does.
//
// The head is clamped to at most half the arrow's actual length. Without
// this, a drag shorter than ARROWHEAD_LENGTH would walk `back` past `start`
// (on the far side of it, not between `start` and `end`) — an oversized
// head that swallows the whole line plus a shaft segment sticking out
// backward past where the user started dragging.
function buildArrowPath(start, end) {
  const totalLength = Math.hypot(end.x - start.x, end.y - start.y);
  const headLength = Math.min(ARROWHEAD_LENGTH, totalLength / 2);
  const headWidth = ARROWHEAD_WIDTH * (headLength / ARROWHEAD_LENGTH);

  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const backX = end.x - headLength * Math.cos(angle);
  const backY = end.y - headLength * Math.sin(angle);
  const perpX = -Math.sin(angle) * (headWidth / 2);
  const perpY = Math.cos(angle) * (headWidth / 2);

  const pathData = [
    `M ${start.x} ${start.y} L ${backX} ${backY}`,
    `M ${end.x} ${end.y} L ${backX + perpX} ${backY + perpY} L ${backX - perpX} ${backY - perpY} Z`,
  ].join(' ');

  return new Path(pathData, { fill: BASE_STROKE_COLOR, stroke: BASE_STROKE_COLOR, strokeWidth: BASE_STROKE_WIDTH });
}

function buildLineOrArrow(tool, start, end) {
  if (tool === 'arrow') return buildArrowPath(start, end);
  return new Line([start.x, start.y, end.x, end.y], { stroke: BASE_STROKE_COLOR, strokeWidth: BASE_STROKE_WIDTH });
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

function buildCloudShape(left, top, width, height) {
  return new Path(buildCloudPathData(left, top, width, height), {
    fill: null,
    stroke: BASE_STROKE_COLOR,
    strokeWidth: BASE_STROKE_WIDTH,
  });
}

const DEFAULT_TEXT_FONT_SIZE = 16;

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

function applyActiveTool(canvas, activeTool) {
  exitActiveEditing(canvas);
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
    canvas.freeDrawingBrush.color = withAlpha(BASE_STROKE_COLOR, TOOL_BRUSH_STYLES[activeTool].opacity);
    canvas.freeDrawingBrush.width = BASE_STROKE_WIDTH;
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
  canvas.upperCanvasEl.style.pointerEvents = INTERACTIVE_TOOLS.has(activeTool) ? 'auto' : 'none';

  // Fabric's own default behavior for a drag starting on empty canvas is a
  // multi-select marquee — every one of our custom tools takes over that
  // same drag gesture for its own purpose, so it must never compete with it.
  canvas.selection = !INTERACTIVE_TOOLS.has(activeTool);
}

// Places a Textbox at the clicked point (already in this canvas's own PDF-
// point coordinate space — `canvas.getScenePoint` accounts for the current
// zoom, so no manual scale math is needed here, same Risk R1 guarantee as
// everything else in this file) and drops the user straight into editing it.
function placeTextbox(canvas, screenEvent) {
  const point = canvas.getScenePoint(screenEvent);
  const textbox = new Textbox('', {
    left: point.x,
    top: point.y,
    fontSize: DEFAULT_TEXT_FONT_SIZE,
    fill: BASE_STROKE_COLOR,
  });
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

// Bounding-box drag-to-place (Text Highlighter, Rectangle, Ellipse):
// `canvas.__boundsDrag` tracks the in-progress drag between mouse:down and
// mouse:move/mouse:up (same start/finish-at-different-events shape as
// free-drawing's `__strokeTool`, just for a shape instead of a path). Width/
// height are tracked on the drag state itself, not read back off the shape,
// since not every shape type stores its own size the same way (Ellipse's
// `.width`/`.height` are derived from `rx`/`ry`, confirmed empirically —
// reading them back would work too, but tracking directly is shape-agnostic).
function startBoundsDrag(canvas, tool, screenEvent) {
  const start = canvas.getScenePoint(screenEvent);
  const shape = BOUNDS_SHAPE_TOOLS[tool].create(start.x, start.y);
  canvas.add(shape);
  canvas.__boundsDrag = { tool, start, shape, width: 0, height: 0 };
}

function updateBoundsDrag(canvas, screenEvent) {
  const dragState = canvas.__boundsDrag;
  if (!dragState) return;
  const { tool, start, shape } = dragState;
  const current = canvas.getScenePoint(screenEvent);
  const left = Math.min(start.x, current.x);
  const top = Math.min(start.y, current.y);
  const width = Math.abs(current.x - start.x);
  const height = Math.abs(current.y - start.y);
  const nextShape = BOUNDS_SHAPE_TOOLS[tool].resize(shape, left, top, width, height);
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
  }
  canvas.requestRenderAll();
}

// Point-to-point drag-to-place (Line, Arrow): rebuilds the shape from
// scratch on every move rather than mutating it in place. Line's own x1/y1/
// x2/y2 + setCoords() do support live mutation (confirmed empirically), but
// Arrow's geometry (a compound Path) doesn't have an equivalent "just move
// the endpoint" API without reaching into Fabric's path-parsing internals —
// rebuilding both the same way keeps this one mechanism instead of two, and
// an interactive drag creates at most a few dozen short-lived objects, not a
// performance concern.
function startLineDrag(canvas, tool, screenEvent) {
  const start = canvas.getScenePoint(screenEvent);
  const shape = buildLineOrArrow(tool, start, start);
  canvas.add(shape);
  canvas.__lineDrag = { tool, start, current: start, shape };
}

function updateLineDrag(canvas, screenEvent) {
  const dragState = canvas.__lineDrag;
  if (!dragState) return;
  const { tool, start, shape } = dragState;
  const current = canvas.getScenePoint(screenEvent);
  canvas.remove(shape);
  const nextShape = buildLineOrArrow(tool, start, current);
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
  }
  canvas.requestRenderAll();
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
const AnnotationCanvas = forwardRef(function AnnotationCanvas({ attachmentId, pdfDoc, activeTool }, ref) {
  const canvasesRef = useRef(new Map()); // pageNumber -> fabric.Canvas
  const savedStateRef = useRef(new Map()); // pageNumber -> fabric JSON (PDF point coords)
  const pdfDocRef = useRef(pdfDoc);
  // "Latest ref" pattern (same convention as PDFViewer.tsx): handlePageRendered
  // is async and called imperatively from outside React's render flow, so it
  // needs the tool that's active *now*, not whatever was active when its own
  // invocation started.
  const activeToolRef = useRef(activeTool);
  activeToolRef.current = activeTool;

  if (pdfDocRef.current !== pdfDoc) {
    // A genuinely different document — nothing to carry forward.
    savedStateRef.current = new Map();
    pdfDocRef.current = pdfDoc;
  }

  useEffect(() => {
    canvasesRef.current.forEach((canvas) => applyActiveTool(canvas, activeTool));
  }, [activeTool]);

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

      handlePagesReset() {
        canvasesRef.current.forEach((canvas, pageNumber) => {
          // Must run before toJSON() — see exitActiveEditing's comment.
          exitActiveEditing(canvas);
          savedStateRef.current.set(pageNumber, canvas.toJSON());
          canvas.dispose();
        });
        canvasesRef.current.clear();
      },

      async handlePageRendered(pageNumber, pageWrapper, pdfCanvasEl) {
        const doc = pdfDocRef.current;
        if (!doc) return;

        const existing = canvasesRef.current.get(pageNumber);
        if (existing) {
          exitActiveEditing(existing);
          savedStateRef.current.set(pageNumber, existing.toJSON());
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
        });
        // Set once: this canvas never needs to receive pointer input itself
        // (Fabric only ever attaches listeners to upperCanvasEl), independent
        // of which tool is active.
        canvas.lowerCanvasEl.style.pointerEvents = 'none';

        canvas.on('path:created', ({ path }) => {
          const style = TOOL_BRUSH_STYLES[canvas.__strokeTool];
          if (style) path.set({ stroke: BASE_STROKE_COLOR, opacity: style.opacity });
          canvas.requestRenderAll();
        });

        canvas.on('mouse:down', (event) => {
          const tool = activeToolRef.current;

          // A stroke can take real time to draw; the active tool could
          // change mid-stroke (e.g. Tab-focus + Enter on a toolbar button
          // while the mouse is still held down elsewhere). Capture which
          // tool a stroke belongs to when it *starts*, and use that in
          // path:created — not whatever's active when the mouse happens to
          // come up — so a stroke drawn as Pen can't retroactively get
          // tagged as the Highlighter's.
          canvas.__strokeTool = tool;

          // Clicking an existing object (e.g. an already-placed text box or
          // highlight) should select/move it (or, for a text box already
          // selected, enter editing on this second click — Fabric's own
          // IText/Textbox behavior, not something this file drives) instead
          // of placing a new one on top of it.
          if (event.target) return;

          if (tool === 'text') {
            placeTextbox(canvas, event.e);
          } else if (BOUNDS_SHAPE_TOOL_IDS.has(tool) && !canvas.__boundsDrag) {
            startBoundsDrag(canvas, tool, event.e);
          } else if (POINT_TO_POINT_TOOLS.has(tool) && !canvas.__lineDrag) {
            startLineDrag(canvas, tool, event.e);
          }
        });

        canvas.on('mouse:move', (event) => {
          updateBoundsDrag(canvas, event.e);
          updateLineDrag(canvas, event.e);
        });

        canvas.on('mouse:up', () => {
          finishBoundsDrag(canvas);
          finishLineDrag(canvas);
        });

        const screenWidth = pdfCanvasEl.width;
        const screenHeight = pdfCanvasEl.height;
        const scale = nativeViewport.width > 0 ? screenWidth / nativeViewport.width : 1;
        canvas.setDimensions({ width: screenWidth, height: screenHeight });
        canvas.setZoom(scale);

        const savedJson = savedStateRef.current.get(pageNumber);
        if (savedJson) {
          await canvas.loadFromJSON(savedJson);
        }
        // Applied after loadFromJSON (not just before) in case restoring
        // objects ever touches canvas-level interaction state.
        applyActiveTool(canvas, activeToolRef.current);
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
