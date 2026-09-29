# spec.md — In-Workspace PDF Editor

Source of truth: `pdf_editor_prd.pdf` (external, not checked into this repo) → distilled into
`tasks/tasks-pdf-editor.md`. This document is the living spec derived from both, kept in sync with
actual behavior as each task lands. It covers the PDF Editor feature primarily — the separate
accounts/workspace track (`tasks/tasks-accounts-workspace.md`) has its own scope, but per that task
list's own per-sub-task loop, this document is updated in place wherever accounts-workspace work
changes or resolves something documented here (starting with task 1.0's replacement of the `x-user-id`
stub — see §4/§9). Track accounts-workspace's own UI/workspace/folders scope in its task list, not here.

## 1. Goal

Brand You's workspace stores PDF attachments but they're read-only inside the product. Today, marking
one up means leaving the workspace (paid editor, unreliable AI tool, or a free tool that requires
uploading the file to a third party), then re-uploading the result — losing the workspace's own access
controls while the file is outside it, and losing any record of what was annotated or why.

This feature adds an in-workspace PDF viewer + fixed-toolset annotation layer so a user can view, mark
up, save-as-new-attachment or download, and share (edit vs. view-only, by email) a PDF without ever
leaving the workspace. It is a **markup and access-control tool**, not a PDF content editor, not a
document-management system, and not cognified software — no model call sits on its read or write path.
When behavior is ambiguous, resolve it toward keeping markup and review inside the workspace, not
toward adding features for their own sake.

## 2. Architecture

| Layer | Choice | Why |
|---|---|---|
| PDF rendering (client) | `pdf.js` (`pdfjs-dist`) | Free/open-source; canvas-based paginated rendering, zoom/pan, thumbnails. |
| Annotation overlay (client) | `fabric` (Fabric.js) | Free canvas toolkit for draw/select/move/resize; keeps its own coordinate system normalized to PDF point space so annotations survive zoom/scroll without drift. Chosen over Konva.js: Fabric's built-in object model (rect/ellipse/polygon/path/IText/group, each with selection/resize handles and a freehand `PencilBrush`) covers A1–A8's tool set with less custom code than Konva's lower-level scene graph would need. |
| Burn-in (server) | `pdf-lib` *(not yet installed)* | Writes the overlay's vector content into a **new** PDF, server-side — the persisted file must not be solely a product of client-side code the user can alter. |
| Auth / DB / Storage | Supabase (Postgres + Storage) | `attachments` + `shares` tables (see `supabase/migrations/`); signed, time-bounded URLs for file access. |
| Backend | Node + Express | Four-verb endpoints (fetch/create/change/remove) against attachments and shares. |

Non-negotiable boundary: **annotations burn in server-side, into a new attachment.** The client never
overwrites the original file, and no authorization decision or burn-in logic that must be correct lives
only in the browser — a hidden UI button is a UX nicety, not a security control.

## 3. Expected Behavior

### 3.1 Viewer (V1–V8)
- Continuous scroll through all pages (V1); visible loading indicator while fetching/rendering (V2).
- Thumbnails panel, open by default, showing every page; clicking one scrolls the main view there (V3).
- Page navigator: current page number, prev/next, type-a-number-and-Enter jump (V4).
- Zoom in/out, 50%–300% in 25% steps, re-rendering pages at the new scale while keeping both
  the page the user was on and their horizontal pan offset in view, rather than resetting
  scroll to the top-left (V5); click-and-drag pan (pointer events, so mouse and touch both
  work), enabled only above 100% zoom — below that the content already fits, so native
  scroll/wheel is enough (V6); "Fit width" computes scale from the first page's native width
  vs. the viewer's current clientWidth and goes through the same zoom pipeline (clamped to
  50%–300%, same scroll-restore behavior) rather than being a separate layout mode (V7).
- No print, search, or any pdf.js default control beyond V1–V7 (V8). Confirmed structurally, not by
  hiding/disabling anything after the fact: the viewer only imports pdf.js's core rendering API
  (`getDocument`, `page.render` onto a raw `<canvas>`) — it never imports `pdfjs-dist/web/pdf_viewer`
  (the example "default viewer" app that ships its own toolbar with print/find/download), its CSS, or
  a `TextLayerBuilder`/`PDFFindController`/`PDFPrintServiceFactory`. No text layer is built either, so
  page content isn't selectable text the browser's native Find could search. There is nothing to turn
  off because none of it was ever wired in.

### 3.2 Annotation tools (A1–A9)
- One Fabric.js canvas per PDF page, layered directly into that page's DOM (`AnnotationCanvas.jsx`,
  attached via `PDFViewer.tsx`'s `onPageRendered`/`onPagesReset` callbacks — `PDFViewer.tsx` rebuilds all
  page DOM on every zoom/document change, so there's no stable DOM to attach to across scale changes
  otherwise). Each canvas is created at the page's *native* (scale 1) PDF-point dimensions and only
  `setDimensions`/`setZoom` change when on-screen scale changes — annotation object coordinates
  (`left`/`top`/etc.) always stay in PDF-point space, never screen pixels, which is what keeps burn-in
  position matching the on-screen position at any zoom level (Risk R1, A1). Per-page state is preserved
  (serialize via `toJSON`/`dispose` before teardown, `loadFromJSON` after reattaching) so annotations
  survive PDFViewer's destructive re-render on every zoom/pan/fit-width/document change.
- Toolbar, fixed left-to-right order: Pen (default) / Freeform highlighter → Text (default) / Text
  highlighter → Ellipse (default) / Rectangle / Line / Arrow (one-sided) → Cloud → Polygon → Signature
  (upload image) (A1). All 11 are individually visible buttons, not collapsed into group dropdowns —
  "(default)" only marks which tool is initially active (Pen, on mount) and which shape tool is
  active if the user hasn't picked a different one; each tool still gets its own always-visible icon
  button (`Toolbar.jsx` + `toolbarIcons.tsx`, inline SVG, no icon-library dependency).
- All line-based marks render solid only (A2); opacity fixed at 100%, not configurable (A3).
- **One global style (A4, implemented)** — color (default red `#dc2626`), fill (default transparent),
  stroke width (default 4pt) — `StyleControls.tsx` (color `<input type="color">`, fill checkbox, stroke
  width number input), rendered in `Toolbar.jsx`, state owned one level up in `ViewerPage.jsx`
  (`const [style, setStyle] = useState(DEFAULT_ANNOTATION_STYLE)`, passed to both `Toolbar.jsx` and
  `AnnotationCanvas.jsx`) — one shared style object for every tool, not per-tool, not per-object. Every
  tool's creation path (free-drawing brush color/width, `BOUNDS_SHAPE_TOOLS`'s `create`/`resize`,
  `buildArrowPath`/`buildLineOrArrow`/`buildCloudShape`, `placeTextbox`) reads `style.color`/
  `style.filled`/`style.strokeWidth` instead of the old hardcoded `BASE_STROKE_COLOR`/`BASE_STROKE_WIDTH`
  constants (removed) — changing a control affects annotations placed *after* the change, not ones
  already on the canvas, **unless** one of them is currently selected, in which case it also restyles
  live (see below). `HIGHLIGHTER_OPACITY` (0.35) is the one hardcoded exception, kept as a constant
  rather than folded into `style` — per A3, it's a fixed property of the Freeform/Text Highlighter tools
  themselves, never a user-facing control, so it has no business being part of the *shared* style.
  Every created object is tagged with which tool made it (`object.set('annotationTool', toolId)`, via a
  `tag()` helper called at the end of every creation path) — this is what lets the "unless re-selected"
  behavior interpret `style` correctly for an arbitrary already-placed object (e.g. text's color lives in
  `fill`, a line's in `stroke`, a rectangle's fill only applies when `style.filled`) without re-deriving
  the object's type from its current paint. The tag is included in `canvas.toJSON()`'s
  `propertiesToInclude` (`['annotationTool']`) in both `handlePagesReset` and `handlePageRendered`'s
  existing-canvas branch, so it survives `PDFViewer.tsx`'s serialize/dispose/reload cycle on every
  zoom/pan change, not just the object's lifetime within one Fabric canvas instance. Two effects drive
  this: one keyed on `[activeTool, style]` re-runs `applyActiveTool` (so the free-drawing brush's live
  color/width track a style change even without a new stroke); one keyed on `[style]` alone checks every
  tracked canvas for `canvas.getActiveObject()` and, if present, calls `applyStyleToObject(active, style)`
  — the actual "unless re-selected" mechanism, dispatching on the object's `annotationTool` tag. A
  drag-in-progress (bounds-drag or line/arrow-drag) captures `style` once at drag-*start*
  (`dragState.style`) and reuses it for the whole gesture rather than re-reading it live, mirroring the
  existing `canvas.__strokeTool` capture-at-start discipline free-drawing already used for the
  "tool changed mid-stroke" case — a style change made mid-drag (e.g. via keyboard focus on the
  stroke-width input while the mouse is still held down) can't retroactively alter a shape already being
  drawn. The arrow's head is sized proportional to `style.strokeWidth` (`arrowheadSize`) rather than a
  fixed constant, and is always filled solid with `style.color` regardless of `style.filled` — that
  toggle is about closed shapes having an optional interior fill, not about whether an arrow *looks* like
  an arrow, which requires a filled head unconditionally.
- **Pen and Freeform Highlighter (A2, A3, implemented)**: `activeTool` is lifted from `Toolbar.jsx` up to
  `ViewerPage.jsx` (owns the state) and passed to both `Toolbar.jsx` (controlled) and
  `AnnotationCanvas.jsx`. `AnnotationCanvas.jsx`'s `FREE_DRAWING_OPACITY` map (keys = free-drawing tool
  ids, values = opacity) is both the free-drawing membership test (`FREE_DRAWING_TOOLS` is derived from
  its keys) and the per-tool opacity lookup — extending it is how any future free-drawing tool gets added
  (through 2.13, no other tool in the task list is `PencilBrush`-based; 2.7's Text Highlighter is a
  drag-rectangle, not freehand, so it needs a parallel mechanism, not this one). Pen and Freeform
  Highlighter share the same global `style.color`/`style.strokeWidth` (task 2.10) but differ in
  `opacity` (1 vs. 0.35, `HIGHLIGHTER_OPACITY` — see A4 above for why that stays hardcoded, not part of
  `style`). Opacity is baked into the *live* brush color (`withAlpha`) so the in-progress
  drag previews at the right transparency — Fabric paints that to a separate top context at the brush's
  raw color, and only creates the real `Path` object on mouse-up — and then reset on the finished path
  via Fabric's `path:created` event back to a solid stroke plus a real, distinct `opacity` property (not
  left baked into the color string), so both the live preview and the serialized state (relevant for
  burn-in translation, task 3.x) are correct. `path:created` reads which tool a stroke belongs to from
  `canvas.__strokeTool`, captured on `mouse:down` (stroke *start*) — not from whatever's active when the
  mouse happens to come up, since a stroke can take real time to draw and the active tool could change
  mid-drag (e.g. Tab-focus + Enter/Space on a toolbar button while the mouse is held down elsewhere).
  This does not contradict A3 ("opacity fixed at 100%, not configurable"): A3 is about there being no
  user-facing opacity *control* for line-based marks — Freeform Highlighter's semi-transparency is a
  fixed, hardcoded property of that specific tool, never adjustable, so both rules hold simultaneously.
  When `activeTool` is any free-drawing tool, every tracked page canvas gets `isDrawingMode = true` with
  a `PencilBrush` at the current global `style.color`/`style.strokeWidth`, and Fabric's `upperCanvasEl`
  gets `pointer-events: auto`
  (`lowerCanvasEl` is always `pointer-events: none` — Fabric never attaches listeners to it — and
  `upperCanvasEl` is `none` too whenever no interactive tool is active, so the overlay doesn't intercept
  clicks meant for pan/zoom-controls). A `pointerdown` listener on `upperCanvasEl` stops propagation
  whenever the active tool needs pointer input, so a drag/click reaches Fabric instead of also
  triggering `PDFViewer.tsx`'s pan gesture on the ancestor `.pdf-viewer` (which calls
  `setPointerCapture` — once captured, even Fabric's own *mouse* events, which is what it actually
  listens for, get redirected to the capturing element per the Pointer Events spec's compatibility-event
  rules, breaking drawing and click-to-place alike if not stopped first).
- **Text (A1, implemented)**: click-to-place, not free-drawing — `AnnotationCanvas.jsx`'s
  `CLICK_TO_PLACE_TOOLS` set (currently just `text`) joins `FREE_DRAWING_TOOLS` and `DRAG_TO_PLACE_TOOLS`
  (below) to form `INTERACTIVE_TOOLS`, the actual pointer-events/stopPropagation gate, and also decides
  whether Fabric's own default multi-select marquee is disabled (`canvas.selection`) — every one of this
  file's custom tools takes over the same "drag starting on empty canvas" gesture Fabric's marquee
  would otherwise claim, so it must never compete with any of them. A single, consolidated `mouse:down`
  listener creates a Fabric `Textbox` at `canvas.getScenePoint(event)` — already in this canvas's own
  PDF-point space, accounting for the current zoom, so no manual scale math is needed (same Risk R1
  guarantee as everything else here) — only when the click didn't land on an existing object
  (`!event.target`, so clicking an existing text box selects/moves it — or, on a second click once
  already selected, enters editing, Fabric's own IText/Textbox behavior — instead of stacking a new one
  on top). The new box gets the global `style.color` as its fill, drops the user straight into editing
  (`enterEditing()` + `selectAll()`), and removes itself on `editing:exited` if the user never typed
  anything, so clicking away *on the canvas* without typing doesn't leave an empty, invisible,
  forever-selectable annotation behind. That listener only fires from Fabric's own on-canvas deselect
  handling, though — clicking something *outside* the canvas entirely (a zoom/fit-width button, a
  different toolbar tool) never triggers it on its own, so `AnnotationCanvas.jsx` also force-exits any
  in-progress editing itself (`exitActiveEditing`, reusing the same `editing:exited` cleanup) both before
  serializing a canvas (`handlePagesReset` — otherwise an empty box mid-edit would get saved into
  `savedStateRef` and `loadFromJSON`'d back permanently on the very next zoom-triggered rebuild, with no
  way to remove it until 2.14's delete tooling exists) and on every tool-switch (otherwise a stray
  editing cursor stays live until the next canvas click).
- **Text Highlighter, Rectangle, Ellipse, Cloud (A1/A2/A4/A7, implemented)**: all four drag out a
  bounding box rather than clicking or freehand-drawing. `AnnotationCanvas.jsx`'s `BOUNDS_SHAPE_TOOLS`
  config map (one entry per tool: how to create the shape at zero size, how to resize it to a given box)
  drives one shared mechanism (`startBoundsDrag`/`updateBoundsDrag`/`finishBoundsDrag`, tracking
  `canvas.__boundsDrag`) instead of four near-duplicate ones — adding a future bounds-drag tool is a new
  map entry, not new drag-handling code. `resize` returns the shape to keep using going forward: most
  tools mutate in place and return the same instance, but Cloud's wavy border is regenerated path data
  on every resize (same reasoning as Line/Arrow rebuilding on every move, below) and returns a *new*
  `Path` instead — `updateBoundsDrag` swaps it into the canvas (remove old, add new) transparently
  either way, so the mechanism doesn't care which tools mutate vs. rebuild. `mouse:move` resizes/rebuilds
  the shape to span the start and current scene points (normalizing to whichever corner is actually
  top-left, regardless of drag direction); `mouse:up` finalizes it, discarding it if the drag was too
  small (`MIN_DRAG_SIZE_SCREEN_PX`, checked in *screen* pixels via `width/height * canvas.getZoom()` — a
  fixed threshold in this canvas's zoom-dependent PDF-point space would let more incidental jitter
  through at low zoom than at high zoom) to be a real shape rather than an accidental click. Text
  Highlighter is a filled, semi-transparent shape with no stroke — `fill: style.color`, a real
  `opacity: HIGHLIGHTER_OPACITY` property (not baked into the fill color, so it stays a real property in
  the serialized state for burn-in later) — sharing the same opacity constant Freeform Highlighter uses
  (extracted so the two tools' visual treatment can't drift apart by accident). Rectangle, Ellipse, and
  Cloud default to `fill: null` (A4's "fill default transparent" — an outline only, letting the page show
  through) but fill with `style.color` when `style.filled` is true — one global color, not a second
  independent fill color — plus `stroke: style.color`/`strokeWidth: style.strokeWidth`, no dash array
  (A2: outlines render solid). Ellipse's own `.width`/`.height` are derived from `rx`/`ry` (confirmed
  empirically, not something this file has to keep in sync manually) — its `resize` sets
  `rx: width / 2, ry: height / 2`. Cloud (A7 — rectangle-based, wavy border, positioned right after the
  shape tools in the toolbar) is a single `Path`: its perimeter is split into roughly `CLOUD_BUMP_SIZE`
  (20-PDF-point) chords per side — at least one per side, so a very small box still gets a real shape
  rather than a degenerate zero-length one — connected by outward-bowed circular arcs (`A` commands)
  instead of straight edges, closing back to the starting point. Sweep-flag direction was confirmed
  visually (bumps bow outward, not inward, for this loop's clockwise screen-coordinate traversal) rather
  than assumed from SVG arc semantics alone. The degenerate-size floor only applies when a dimension is
  *exactly* zero (the instant right after `mouse:down`, before any real drag) — a genuinely thin real
  drag (e.g. bracketing a single line of text, tall enough to matter but shorter than one bump) renders
  at its actual dragged size, not inflated up to `CLOUD_BUMP_SIZE`, matching how Rectangle/Ellipse never
  inflate a thin real drag either. The wavy border still bows outward past whatever box it's given by
  roughly one bump radius on each side — an inherent property of the arc geometry, not a bug — so
  Cloud's rendered bounding box is always somewhat larger than the nominal drag box, thin or not.
- **Line, Arrow (A1/A2, implemented)**: drag between two points, not a bounding box — direction matters
  (Arrow's head goes at the end point) and there's no "normalize to top-left corner" the way
  Rectangle/Ellipse have, so this is a second mechanism
  (`startLineDrag`/`updateLineDrag`/`finishLineDrag`, `canvas.__lineDrag`), not forced into
  `BOUNDS_SHAPE_TOOLS`'s shape. Both rebuild the shape from scratch on every `mouse:move` rather than
  mutating it in place — Fabric's `Line` does support live mutation (`.set({x2,y2})` + `.setCoords()`,
  confirmed empirically), but Arrow's geometry (a compound `Path`) doesn't have an equivalent without
  reaching into Fabric's path-parsing internals, so both use the same rebuild-each-move approach rather
  than two different ones; an interactive drag creates at most a few dozen short-lived objects, not a
  performance concern. Arrow (one-sided per A2 — arrowhead at the end point only) is a single `Path` with
  two subpaths: the shaft (stopping short of the head's base so it doesn't visibly poke out past it) and
  a filled triangle, sized proportional to `style.strokeWidth` (`arrowheadSize`), but clamped to at most half the arrow's
  actual drag length — without that clamp, any arrow shorter than the head's full length would have its
  head walk past the *start* point (on the far side of it, not between start and end), rendering an
  oversized head that swallows the whole line plus a shaft segment sticking out backward past where the
  user started dragging. Found by code review, confirmed empirically (hand-computed geometry for a
  short drag, then re-verified in a real browser across every direction — horizontal, vertical, both
  diagonals, and the short-arrow case specifically) before landing. One `Path` object, not a `Group` of
  a `Line` + a separate arrowhead shape — serializes/burns-in (task 3.x) the same straightforward way
  every other shape here does, no group-of-objects special-casing needed later. Discarding an accidental
  click uses the straight-line distance between the two drag points (converted to screen pixels via
  `canvas.getZoom()`) against the same `MIN_DRAG_SIZE_SCREEN_PX` threshold.
  **Implementation note (not itself a requirement, but load-bearing):** Fabric wraps whatever `<canvas>`
  element it's given in its own `.canvas-container` div (`position: relative` by default, holding a
  "lower" and "upper" canvas — only the upper one gets an explicit inline `position: absolute` from
  Fabric). Without `.canvas-container { position: absolute !important; }` in `global.css` (`!important`
  because Fabric's own `position: relative` is itself an inline style), that wrapper sits in normal flow
  *after* the PDF canvas inside `.pdf-viewer-page` instead of overlaying it — found and fixed while
  implementing 2.4, but it was latent since 2.2 (nothing before 2.4 ever made the overlay visibly
  interactive enough to notice).
- **Polygon (A1, implemented)**: click to place each vertex, close by clicking back on the first one —
  neither free-drawing, a single click, nor a drag between two fixed points, so it's the first tool
  whose gesture spans more than one `mouse:down` and gets its own tracking (`canvas.__polygonDrag`:
  `vertices` (in scene/PDF-point space), the in-progress preview object, and the `style` captured at the
  *first* click — kept fixed for the whole gesture, same reasoning as Line/Arrow and the bounds-drag
  tools' drag-start style capture, so a style change picked mid-construction can't retroactively repaint
  segments already placed). Every click after the first either adds a vertex or, if there are already at
  least `MIN_POLYGON_VERTICES` (3) placed and the click lands within `CLOSE_POLYGON_SCREEN_PX` (10
  screen pixels — deliberately larger than `MIN_DRAG_SIZE_SCREEN_PX`'s 4, since this is a deliberate
  re-click on a specific existing point that needs to actually be clickable, not a jitter guard) of the
  first vertex, closes the shape into a real Fabric `Polygon` (tagged `'polygon'`,
  `fill`/`stroke`/`strokeWidth` from `style` exactly like Rectangle/Ellipse/Cloud) — unless the resulting
  shape's own bounding box is smaller than `MIN_DRAG_SIZE_SCREEN_PX` in screen pixels (a handful of
  near-identical rapid clicks, e.g. someone double/triple-clicking while unsure how the tool works), in
  which case it's discarded instead of kept as a permanent, essentially invisible stray shape — same
  reasoning as `finishBoundsDrag`/`finishLineDrag`'s size guard, and especially important here since
  there's no delete tool yet (A5/A6 land in 2.13/2.14) to remove one otherwise. The closing-distance
  check is done in *scene* space, converted to screen pixels via `canvas.getZoom()` at comparison time —
  same as every other size/distance check in this file — rather than diffing the two clicks' raw
  `clientX`/`clientY` directly: found by code review that the raw-client-diff version only holds if the
  canvas element hasn't moved on screen between the two `mouse:down` events, which breaks if the page
  scrolls mid-construction (an entirely ordinary interaction for a page taller than the viewport) even
  though it happens to work at a fixed scroll position — fixed and covered by a regression test that
  changes the stubbed bounding rect between two `mouse:down` calls to simulate a scroll. Closing early
  (fewer than 3 vertices) is simply treated as placing another vertex near the first one, not as a no-op
  or an error. The in-progress state is a `Polyline` — vertices
  placed so far, plus (while the mouse is moving) a rubber-band segment to the current pointer position —
  rebuilt from scratch on every `mouse:move`/vertex-add rather than mutated in place (same rebuild-each-
  move approach as Line/Arrow), always unfilled regardless of `style.filled`: unlike Rectangle/Cloud's
  in-progress drag (already the one real shape being resized), an open Polyline isn't a closed polygon
  yet, so previewing a fill would show something that doesn't exist until the shape actually closes.
  Every click after the first bypasses the usual "don't start on top of an existing object"
  (`!event.target`) guard every other tool's *first* click respects — once a polygon is already under
  construction, a continuation click landing on top of an unrelated existing annotation is still meant
  for the polygon being built, not for that other object. Switching tools away from an in-progress
  polygon, or a page reset (zoom/pan) landing mid-construction, discards the incomplete preview
  (`cancelPolygonInProgress`, folded together with the pre-existing `exitActiveEditing` call into one
  `cancelPendingGestures` helper used at all three call sites: the tool-switch effect, `handlePagesReset`,
  and `handlePageRendered`'s existing-canvas branch) rather than leaving it on the canvas — otherwise
  (same bug class 2.5 already fixed for an empty Textbox surviving a reset) an untagged, half-built
  `Polyline` would get serialized into `savedStateRef` and reloaded back permanently on the next rescale.
- Any placed annotation: select → move, resize, or delete (A5). Selection/move/resize (A5) is Fabric's
  own default object interactivity for every tool except Pen/Freeform Highlighter — those two put the
  canvas in `isDrawingMode`, which skips Fabric's target hit-testing on `mousedown` entirely (by design,
  so every pixel draws), so a click on an existing annotation would otherwise draw a new stroke over it
  instead of selecting it. Fixed (2.13) by hooking the real native `pointerdown` listener already
  attached to `upperCanvasEl` (added for the PDFViewer.tsx pan-gesture fix, see `AnnotationCanvas.jsx`):
  while `isDrawingMode` is true, it hit-tests via `canvas.findTarget(event)`, and if the click landed on
  a selectable object, flips `isDrawingMode` off for that one gesture (restored on `mouse:up`) so
  Fabric's normal (non-drawing) mousedown path selects and sets up drag/resize on it instead; a click on
  empty canvas while a prior selection exists calls `discardActiveObject()` first, since the
  drawing-mode path never does that itself. This relies on `pointerdown` always being fully dispatched
  before the browser synthesizes the following `mousedown` for the same click — real, spec'd ordering,
  not something this file enforces — and, at `scale > 1`, on the pre-existing `stopPropagation()` on the
  same listener already blocking PDFViewer.tsx's pan gesture from calling `preventDefault()` on this same
  event first; without that, this fix would never see the event while panning is possible. Resize-by-
  corner-handle is unmodified, built-in Fabric behavior once selection works, exercised by a dedicated
  test (2.13) computing the real handle position via `existing.oCoords.br` after `setCoords()`.
  **Delete (A6, implemented, 2.14)**: pressing Delete or Backspace requests confirmation rather than
  deleting immediately — a `document`-level `keydown` listener in `AnnotationCanvas.jsx` (attached once,
  not per-canvas, since a plain `<canvas>` element isn't focusable by default and the fix must work
  regardless of which page's canvas the user last clicked on) walks every tracked page canvas
  (`getSelectedAnnotation`) for the first one with a live `getActiveObject()` and, if found, calls
  `onRequestDelete` (a prop wired from `ViewerPage.jsx`, which owns the actual confirmation modal's open
  state — `AnnotationCanvas.jsx` renders nothing of its own). The listener is skipped entirely
  (`isEditableElementFocused`) when `document.activeElement` is a real form control (`INPUT`/`TEXTAREA`/
  `SELECT`/`contentEditable`) — which, for free, also covers a Textbox annotation currently mid-edit,
  since Fabric's own `enterEditing()` focuses its offscreen `hiddenTextarea` (a `TEXTAREA` element), so
  Backspace while actually typing into a text annotation is never intercepted. `ViewerPage.jsx` reuses the
  existing generic `ConfirmModal.jsx` (not a separate `DeleteConfirmModal.jsx` — see Relevant Files in
  `tasks/tasks-pdf-editor.md`), passing the exact required title/body copy and explicit `data-testid`
  props (`ConfirmModal.jsx` gained optional `testId`/`titleTestId`/`messageTestId`/`confirmTestId`/
  `cancelTestId` props for this, all opt-in so any other future caller is unaffected) matching
  `tests/consts/inkSpace.ts`'s pre-existing `DELETE_CONFIRM_*` test-id contract. Confirming calls a new
  imperative-handle method, `deleteActiveObject()`, which re-finds the selected annotation at call time
  (not whatever was selected when Delete was first pressed, since confirming happens via a separate,
  later click) and removes it from its canvas; cancelling just closes the modal, leaving the annotation
  untouched (matches the "Cancel during delete confirmation" edge case in §5).
- Cloud: rectangle-based, wavy border, positioned right after the shape tools (A7).
- Signature: positioned after Polygon, signature icon, image upload placed on the page at a default
  size the user can move/resize; validated (type + size) and re-encoded server-side, not stored/served
  as the raw upload (A8, R8).
- No annotation capability beyond A1–A8 for edit users — no notes tool, no cover pages, nothing
  unlisted (A9; see §6 Out of Scope).

### 3.3 Download (D1–D3, implemented)
- "Download" available from the viewer toolbar (`Toolbar.jsx`'s `.toolbar-actions`, `TEST_IDS.DOWNLOAD_BUTTON`)
  (D1); calls the burn-in endpoint with the current annotation state and decodes the result straight to a
  browser download — output includes every annotation burned in (D2); filename is the *original*
  attachment's filename, taken from the burn-in response, never the Save flow's renamed/timestamped one
  (D3). `ViewerPage.jsx`'s `handleDownload` guards against a second concurrent download while one is
  already in flight (`downloading` state) and surfaces a fetch/burn-in failure as inline text next to the
  button (`TEST_IDS`-unlisted `download-error` testid — D1–D3 don't specify a failure UX, so this is a
  minimal "never fail silently" floor, not a new modal/toast system).

### 3.4 Save as new attachment (S1–S8, F1–F6, implemented)
- "Save" (`TEST_IDS.SAVE_BUTTON`, `Toolbar.jsx`) opens `SaveModal.tsx` (S1), filename field pre-populated
  per the filename rules below (S2).
- On confirm: annotations burn into the PDF via the burn-in endpoint, then the result is persisted via
  `POST /api/attachments` — a **new** attachment row every time (`saveAttachment` in
  `server/services/storage.ts` has no update/overwrite code path at all, not just a convention callers
  happen to follow) — the original attachment/its Storage object are never written to (S3).
- Progress shown while in flight (`TEST_IDS.SAVE_PROGRESS_INDICATOR`, S4); the filename field, Cancel, and
  the "X" close control all get both `disabled` *and* a matching visual style
  (`global.css`'s `.save-modal-*:disabled` rules — a `disabled` prop with no style change is a review
  finding per `agents/skills/frontend-patterns.md`) during save (S5).
- Failure toast, exact text: `"Couldn't save <Attachment name>."` (S6). Success toast, exact text:
  `"<attachment name> saved successfully to workspace."` (S7). **`<Attachment name>` is the filename this
  specific save attempt submitted** (captured at confirm-click time, before the async burn-in/save calls),
  not the original attachment's name — if a user changes the filename field, submits, and it fails, the
  toast names what they actually tried to save as. Either way, **the modal stays open** — `SaveModal.tsx`
  has no code path that calls `onClose` after a save settles, success or failure (S8).
- New attachments are always owned by whoever saves them (`req.headers['x-user-id']` at request time),
  not the original attachment's owner — someone with only `edit` share access can save a copy they now own.

**Filename rules (implemented in `src/utils/filenameUtils.ts`, shared by the client and
`server/routes/attachments.js` so client and server can't drift):**
- Default = `<existing filename> <UTC timestamp>` (F1); timestamp format `<day><month><year><hour><minute>`
  (`DDMMYYYYHHmm`, all zero-padded), UTC always, regardless of viewer timezone (F2).
- **Implementation decision (F1/F2, not otherwise specified):** the timestamp is inserted *before* the
  file extension, with a single space separator (`report.pdf` → `report 270920261834.pdf`), not appended
  after it — otherwise the extension would land in the middle of the filename and the browser-facing
  download would lose its `.pdf` suffix.
- If the filename's base (before the extension) already ends in a timestamp in this exact
  space-plus-12-digits shape, the new one **replaces** it rather than appending a second one (F3) — a
  trailing number that isn't in this exact shape (e.g. `invoice 42.pdf`) is left alone and a new timestamp
  is appended normally, not mistaken for an existing one.
- Validation (`validateFilename`), checked client-side (`SaveModal.tsx`, on change and on submit) and
  re-checked server-side (`POST /api/attachments`, authoritative):
  - Empty (or whitespace-only) → `"Required field"` (F4)
  - `> 255` chars → `"255 characters maximum"` (F5)
  - Path separators (`/`, `\`), the Windows-reserved set (`* ? " < > | :`), or control characters →
    `"Invalid characters"` (F6)

**Burn-in (`server/services/burn-in.ts`, via `pdf-lib`):**
- Takes the Fabric.js annotation JSON `AnnotationCanvas.jsx`'s `getAnnotationsForBurnIn()` produces (one
  entry per page that has at least one object, in that page's own PDF-point space — no client-side
  coordinate conversion, matching every other Risk R1 guarantee in this feature) and draws each object onto
  a copy of the original PDF's pages via `pdf-lib`.
- Coordinate math (`server/services/annotationGeometry.ts`, deliberately dependency-free — see the file's
  own comment — and unit-tested in `tests/annotationGeometry.test.ts` independent of whether `pdf-lib`
  happens to be installed) derives each object's current bounding box from `left`/`top`/`width`/`height`/
  `scaleX`/`scaleY`/`originX`/`originY` exactly as Fabric itself interprets them — **including** the
  documented Rectangle/Ellipse/Text-Highlighter center-origin offset (§9) — so a burned annotation matches
  whatever is actually on screen, bug and all, rather than silently "correcting" a separately-tracked,
  separately-scoped issue. Line/Path (Arrow, Cloud, pen/highlighter strokes)/Polygon additionally re-derive
  their current on-canvas position from their *raw*, creation-time point data (which Fabric never rewrites
  on move/resize) re-anchored onto that current bounding box — this is what keeps a dragged or resized
  annotation burning in at its current position, not its original one.
- **Endpoint contract:** `POST /api/burn-in/:attachmentId` (the existing route's own mount path — task 3.2
  described this as `/api/attachments/:id/burn-in`, but the file already existed under `/api/burn-in`
  before this task, gated by `requirePermission(canBurnIn)`; reusing it rather than adding a second route
  for the same operation) with body `{ pages: [{ pageNumber, objects }] }`, returning
  `{ filename, mimeType, pdfBase64 }` as JSON — **not** a binary response. Both Download and Save reuse this
  one endpoint/response shape (`src/lib/create.js`'s `burnInAttachment`) rather than Download needing a
  separate binary-fetch code path in `src/lib`.
- `server/index.js`'s JSON body limit was raised from 1mb to 20mb to fit a real PDF's base64 encoding in
  both directions (burn-in's response, save's request) — task 5.3 still owns the *authoritative,
  user-facing* PDF size limit (`MAX_UPLOAD_BYTES`); this is only the outer body-parser ceiling so a
  legitimate file up to that limit doesn't get a raw, unhelpful 413 first.
- **Known gaps, tracked, not fixed here:** rotation (Fabric's `angle`, reachable via its default rotate
  handle once an object is selected) is not reproduced in the burned PDF — every shape burns in at
  `angle: 0`'s position/size math regardless of any rotation applied on screen. Burned text always uses
  Helvetica (`StandardFonts.Helvetica`) regardless of what Fabric's Textbox default font would render on
  screen — text styling/font family was never a configurable requirement (A3/A4), so this is a visual
  approximation, not a missing feature. `drawTextbox`'s per-line baseline (`box.y + fontSize + index *
  lineHeight`) is likewise an approximation, not a font-metrics-exact ascent — close enough for the
  fidelity bar this feature targets, not pixel-exact against Fabric's own text rendering. Curved paths'
  (Cloud's arcs, which Fabric normalizes to Bezier curves at parse time) raw bounding box is approximated
  from the naive min/max of all listed path
  coordinates (anchor *and* control points), not the true tight bezier-curve bounding box Fabric itself
  computes — close in practice, not pixel-exact.

## 4. Permissions Model — single-owner (revised in tasks-accounts-workspace.md task 7.0)

**This section replaces the PDF editor PRD's original P1–P5 (email-based sharing, edit/view roles).**
The accounts-workspace PRD's §3.4/WF5 revision cuts cross-account sharing entirely, not just narrows
it — an attachment now belongs to exactly one user, its owner, and no one else can ever reach it. There
is no grant-by-email flow, no edit/view distinction, and no recipient-facing UI anywhere in the product.

Current model:

- An attachment is reachable only by the `auth.users` id in its own `owner_id` column.
- Every attachment route is gated by `requirePermission(<check>)`, where the check is an owner-only
  lookup (`server/middleware/permissions.ts`) — never a client-supplied id, always `req.userId` from
  `requireAuth`.
- No permission (a non-owner, or a file that no longer exists) → `src/viewer/NoAccessState.tsx`, a
  defined empty state, never a blank screen or generic error (carried over from the old P5, still true
  under the single-owner model).

Default-deny: access exists only for the owner, full stop.

**Implementation:**
- `server/middleware/permissions.ts` — `canRead`/`canWrite`/`canBurnIn`/`isOwner` are all owner-only now
  (identical logic; kept as separate named exports since call sites still read as "read access" vs.
  "write access" vs. "must be the owner"). `canRead`/`canWrite`/`canBurnIn` defer to the route's own 404
  for a genuinely nonexistent attachment id; `isOwner` fails closed instead, for routes (like
  `DELETE /api/attachments/:id`) with no follow-up lookup of their own that would otherwise turn a
  false-open into a correct 404. `hasShareRole`, the `ShareRole`/`AttachmentRole` types, and
  `getAttachmentRole` were removed outright — there's no longer a role to compute beyond "is the caller
  the owner."
- `server/routes/attachments.js`'s `GET /:id` no longer computes or returns a `role` field — anyone who
  passes `requirePermission(canRead)` is unconditionally the owner, so there's nothing left to tell the
  client.
- `src/toolbar/Toolbar.jsx` no longer takes a `role` prop. There is a single always-editable toolbar:
  every annotation tool, `StyleControls`, Save, and Download all render unconditionally. No Share
  button anywhere.
- `src/viewer/ViewerPage.jsx` passes `activeTool` straight through to `AnnotationCanvas.jsx` with no
  edit-gating ternary, and no longer renders a Share modal.
- `src/viewer/usePdfDocument.ts`'s `AttachmentDownload` type dropped its `role` field for the same
  reason as the server response above.
- **Deleted outright** (no longer reachable from any code path): `src/modals/ShareModal.tsx`,
  `server/routes/shares.ts`, `server/services/shares.ts`, `server/services/users.ts`
  (`resolveUserIdByEmail` had no other caller), `src/viewer/NotesPanel.tsx` (the old P4 view-only
  substitute — with no view-only role left to trigger it, keeping it around would have been dead code,
  so it was removed rather than "updated to drop gating" as tasks-accounts-workspace.md's Relevant
  Files literally describes; the gating it responded to lived in `Toolbar.jsx`, not in `NotesPanel.tsx`
  itself), plus their tests (`tests/ShareModal.test.tsx`, `tests/shares.test.ts`,
  `tests/NotesPanel.test.tsx`) and client API wrappers (`fetchShares`/`createShare`/`removeShare` in
  `src/lib/fetch.js`/`create.js`/`remove.js`).
- `supabase/migrations/20260929150000_drop_shares.sql` drops `public.shares` and the `public.share_role`
  enum. Applied cleanly (`npm run supabase:migrate` → `"message":"Finished supabase db push."`);
  `src/lib/database.types.ts` was regenerated (`supabase gen types typescript --linked`) and no longer
  mentions either.
- `tests/permissions.api.test.ts`/`tests/permissions.test.ts` kept their owner-vs-stranger assertions
  and dropped every share-recipient case; `tests/routePermissionAudit.test.ts`'s static sweep no longer
  scans `server/routes/shares.ts` (deleted). `tests/consts/inkSpace.ts`/`routes.ts` dropped the dead
  `SHARE_*`/`NOTES_*` test ids and `Routes.Shares`/`ShareById`.

**Resolved (accounts-workspace task 1.7, unaffected by the sharing cut above):**
`server/middleware/permissions.ts`'s `requirePermission` no longer reads any client-supplied header.
Identity now comes from `req.userId`, set by `server/middleware/requireAuth.ts` — mounted ahead of every
`/api/*` route in `server/index.js` (except `/api/auth/*`, which must be reachable unauthenticated) —
which verifies the caller's bearer token against Supabase Auth itself (`supabase.auth.getUser(token)`, a
real round-trip, not just decoding the JWT locally) before anything downstream runs. `src/lib/currentUser.ts`
(the client-side half of the old stub, localStorage-backed) was deleted wholesale, not migrated, per its
own comment's instruction; `src/routes/LoginPage.tsx`/`SignupPage.tsx` (task 1.4/1.5) are the real
login/signup UI it was standing in for. Owner-only access is now enforced against a real verified
identity, not a value the client can simply set.

Two things task 1.0 deliberately did **not** attempt to verify live, both worth flagging in the next
security/product review of the accounts-workspace feature:
- **EV2** ("an unverified account can still log in and use its own workspace with no gate anywhere")
  depends on the Supabase project's own Auth setting for whether `signUp`/`signInWithPassword` issue a
  session before the email is confirmed. `SignupPage.tsx`/`LoginPage.tsx` handle both outcomes in code
  (a null `session` after signup shows a "check your email" notice instead of erroring), but nobody
  confirmed live which behavior this project's dashboard is actually configured for. **Re-confirmed in
  task 2.4:** a repo-wide grep for any `email_confirmed`/`confirmed_at`/"must be verified"-shaped check
  under `server/` and `src/` finds nothing — there is still no code path anywhere that gates login or
  workspace access on verification status. EV2 is satisfied by absence of a gate, not by a test that
  exercises the live Supabase setting.
- **Google sign-in (SU2/LG2) and its auto-linking edge case (SU4/R1) were dropped from scope entirely**,
  by explicit decision recorded in `tasks/tasks-accounts-workspace.md` task 1.1 — not deferred, not a
  gap. Email/password is the only sign-in method.

**Task 2.0 (password reset & email verification):** `ForgotPasswordPage.tsx` (PR1, linked from
`LoginPage.tsx`'s existing "Forgot password?" link) calls `supabase.auth.resetPasswordForEmail(email, {
redirectTo: '<origin>/reset-password' })` and always shows the same "if an account exists…" notice
regardless of whether the email actually has an account — deliberate, to avoid using this form as an
email-enumeration oracle. `ResetPasswordPage.tsx` (PR2/PR3, routed at `/reset-password`) relies entirely
on Supabase's own recovery-link handling: a valid link has its tokens consumed automatically by the
Supabase client's `detectSessionInUrl` (default `true`) before the component ever renders, leaving no
error params to find; an expired or already-used link instead redirects back with
`error`/`error_code`/`error_description` in the URL hash (or, per `src/lib/authLinkError.ts`'s shared
`parseAuthLinkError`, the query string), which the page turns into a "Reset link expired" state with a
link back to `/forgot-password` instead of rendering the new-password form. Submitting the form calls
`supabase.auth.updateUser({ password })` — PR3 (old password invalidated immediately) is Supabase's own
guarantee once that call succeeds, not something this component implements. `VerifyEmailPage.tsx`
(EV1/EV3, routed at `/verify-email`) uses the same `parseAuthLinkError` helper for the
signup-confirmation link: no error params means verification already succeeded (shows "Email verified" +
a link to `/workspace`); error params show a "Verification link expired" state with a resend form that
calls `supabase.auth.resend({ type: 'signup', email })`. None of these three pages sit behind
`RequireSession` in `App.jsx` — reaching them is exactly the unauthenticated case they exist for. Task 3.3
(email change) will trigger the same underlying `resend`/`updateUser` calls directly from
`SettingsPage.tsx`, not by reusing `VerifyEmailPage.tsx` as a component. **Found in code review:** the
link-error-parsing logic was originally duplicated verbatim across both pages; extracted to
`src/lib/authLinkError.ts` in the same change, which also dropped a redundant `.replace(/\+/g, ' ')`
(`URLSearchParams` already decodes `+` to a space) and a dead hash-without-`#` ternary branch that can't
occur from a real `window.location.hash`. Also added: a test asserting `resetPasswordForEmail`'s
`redirectTo` actually points at `/reset-password` (the literal PR1↔PR2 wiring, previously unchecked), and
a query-string-based link-error test for each page (previously only the hash path was exercised).
**Not verified live in this session:** an actual round-trip through a real Supabase project's emailed
links (the redirect URL, hash-param shape, and `error_code` values used above are documented Supabase
behavior, not observed against this project's own dashboard config) — same category of gap as EV2 above.
**Before deploying:** this is the first caller of `resetPasswordForEmail`'s `redirectTo` option in the
codebase (`SignupPage.tsx` doesn't pass one), so the Supabase project's Auth dashboard "Redirect URLs"
allow-list must include `<origin>/reset-password` or the emailed link will fail in a way no current test
(all component-level, against a mocked client) can catch. No Playwright coverage was added for the same
`@playwright/test` install blocker as task 1.11 (see §9);
`tests/ForgotPasswordPage.test.tsx`, `tests/ResetPasswordPage.test.tsx`, and `tests/VerifyEmailPage.test.tsx`
cover the component-level behavior instead.

## 5. Edge Cases

- **Already-timestamped filename** on save (F3) — must replace, not double-append (fixture:
  `tests/fixtures/already-timestamped_20250824T071530Z.pdf`).
- **Boundary filename lengths** — exactly 255 chars (valid) vs. 256 (invalid); empty string; unicode
  names; disallowed characters (F4–F6, Risk R6).
- **Oversized signature image upload** — rejected client-side for instant feedback *and* server-side as
  the authoritative check; limit surfaced to the user, not a silent failure (Risk R8, fixture:
  `tests/fixtures/oversized-image.png`).
- **Large multi-page PDF** — progressive/virtualized rendering so the whole document doesn't have to
  load before the first page is visible (Risk R2, fixture: `tests/fixtures/large-multipage.pdf`).
- **Coordinate drift** — the annotation overlay must be normalized to PDF point space, not screen
  pixels, so burned-in position/size matches the on-screen canvas at fit-width, 100%, and 200% zoom
  (Risk R1).
- **View-only user calls the API directly** (bypassing the UI) to burn-in or save — must get 403, not
  200 (Risk R4).
- **Dead link / no permission / deleted attachment** — empty state (P5), not a blank screen, a raw 404,
  or a generic error.
- **Save failure mid-flight** — must visibly look like failure (S6 toast), never a default/blank state
  a user could mistake for success.
- **Concurrent saves from two sessions** — largely designed away by always creating a new attachment
  rather than overwriting (S3/S7); residual risk is filename collision, handled by F1–F6 (Risk R3).
- **Cancel during delete confirmation** — cancelling `"Delete annotation?"` must leave the annotation
  untouched.

## 6. Out of Scope (hard requirements, not omissions)

Print · full-text/document search · any non-PDF viewable attachment type (a signature/stamp/logo/cover
image is added *as PDF content* via the annotation tool, never as a separate attachment type) ·
per-annotation individual styling · a notes/comment tool of any kind (the PDF editor's old view-only
"notes" control, `NotesPanel.tsx`, was deleted in tasks-accounts-workspace.md task 7.0 along with the
view-only role it existed for — see §4) · cover pages, stamps, callouts, redaction, or any annotation
type not in A1–A8 · direct editing of underlying PDF content (text/images) · OCR, form-filling, or
legally-binding e-signature · real-time multi-user co-editing · cross-session undo/version history ·
page import/blank-page/reorder/rotate (stretch, ST2) · locally persisted style preferences (stretch,
ST1) · cross-account sharing of any kind (cut entirely per §4).

## 7. Acceptance Criteria (Definition of Done)

Demonstrable on a real attachment, by someone other than the builder:

1. PDF opens with a loader; thumbnails visible by default; working scroll, zoom, pan, fit-width, and
   page navigation (current page, prev/next, type-to-jump). — **§3.1**
2. A user places at least one annotation from every tool category, using the single global style, and
   can move/resize/delete any of them (delete gated by the exact-text confirmation modal). — **§3.2**
3. Download produces the original filename with annotations burned in. — **§3.3**
4. Save opens the rename dialog pre-filled per F1–F3, validates against F4–F6, shows progress with
   controls disabled while burning/saving, and ends in the exact success/failure toast — dialog stays
   open. — **§3.4**
5. **Superseded by the single-owner model (§4):** the original criterion here ("an owner can grant
   edit/view by email...") described the sharing feature cut in `tasks/tasks-accounts-workspace.md`
   task 7.0. Current criterion: only the owner can ever open their own attachment; anyone else, or a
   dead/nonexistent link, gets the empty state (`NoAccessState.tsx`) — never a blank screen or generic
   error.
6. None of the §6 out-of-scope items has been added to the shipped UI or API.

Success metrics for grading whether each is *actually* met (checkable by a second person, not just
self-reported):

| Metric | Target |
|---|---|
| Annotate-and-save completion | ≥ 95% of Save attempts on valid input end in a success toast |
| Burn-in fidelity | On-screen vs. burned position/size match within a defined tolerance at fit-width, 100%, 200% zoom |
| Permission enforcement | 0 successful edit/save/read actions from a non-owner caller, **including via direct API calls** |
| Filename validation | 100% of F4–F6 boundary cases trigger correctly in tests |
| Empty-state coverage | 100% of no-permission / not-found cases render the defined empty state |

## 8. Current Implementation Status

Tracked in detail in `tasks/tasks-pdf-editor.md`. Snapshot:

| Phase | Status |
|---|---|
| 1 — Viewer (V1–V8) | Done (1.1–1.10): render/scroll/loading/thumbnails, page navigator, zoom in/out, pan, fit-width, confirmed absence of default pdf.js print/search UI, and component tests for `PDFViewer`/`PageNavigator`. |
| 2 — Annotation tools (A1–A9) | Done (2.1–2.14; 2.15's tests land alongside): Fabric.js installed (2.1); `AnnotationCanvas.jsx` layers a per-page Fabric canvas normalized to PDF-point space, coordinated with `PDFViewer.tsx`'s destructive re-renders (2.2). Pen/Freeform Highlighter (2.4/2.6), Text (2.5), Text Highlighter (2.7), Rectangle/Ellipse (2.8), Line/Arrow (2.8), Cloud (2.9), the global style control (`StyleControls.tsx`, 2.10), Polygon (2.11), Signature (2.12), select/move/resize (2.13, A5), and the delete-confirmation modal (2.14, A6) are implemented. Signature (`SignatureUploader.tsx`): validates type/size client-side, re-encodes the upload through an offscreen `<canvas>` before placing it (A8/R8's client-side half — the *authoritative* server-side re-check/re-encode is task 5.3/5.6, done: see §10), and places it via `AnnotationCanvas.jsx`'s `addSignatureImage` at a default width (clamped to the page's own width) on whichever page is currently on screen. Select/move/resize (2.13): see §3.2's A5 note for the Pen/Freeform Highlighter fix this required. Delete (2.14): see §3.2's A6 note. |
| 3 — Download & Save (D1–D3, S1–S8, F1–F6) | Implemented (3.1–3.11): burn-in (`server/services/burn-in.ts` + `annotationGeometry.ts`), save-as-new-attachment (`server/services/storage.ts`'s `saveAttachment`/`downloadAttachmentBytes`), `src/utils/filenameUtils.ts` (F1–F6, shared client/server), `SaveModal.tsx`, and the Download/Save toolbar wiring in `ViewerPage.jsx`/`Toolbar.jsx`. **Blocked on dependency install:** `pdf-lib` could not actually be installed in the session that wrote this — the sandboxed environment's network access to `registry.npmjs.org` timed out, and redirecting to the Autodesk Artifactory mirror was itself blocked by the harness's own policy. `server/services/burn-in.ts` and `storage.ts` are written against `pdf-lib`'s documented API but have never actually been run — `npm run typecheck` currently fails on exactly those two files' `pdf-lib` import (nothing else). **Action needed:** run `npm install pdf-lib` in an environment with real registry access, then re-run `npm run typecheck` and `npm test` (particularly exercise a real Download/Save against a real attachment) before treating burn-in as verified rather than reviewed-but-unrun. The coordinate math those two files depend on (`annotationGeometry.ts`) has no such dependency and *is* unit-tested (`tests/annotationGeometry.test.ts`). |
| 4 — Permissions (single-owner) | **Superseded, see §4.** The original email-based sharing implementation (P1–P5, `shares` table, `ShareModal.tsx`, edit/view roles) was fully built and tested in an earlier session, then cut entirely in `tasks/tasks-accounts-workspace.md` task 7.0 per that PRD's §3.4/WF5 revision. Current state: `server/middleware/permissions.ts`'s `canRead`/`canWrite`/`canBurnIn`/`isOwner` are all owner-only; every attachment/burn-in route is gated by `requirePermission` against real `requireAuth` identity (`req.userId`, a verified Supabase JWT — not the old `x-user-id` stub); `NoAccessState.tsx` still covers the no-permission/dead-link empty state via `usePdfDocument.ts`'s `accessDenied`. `supabase/migrations/20260929150000_drop_shares.sql` dropped the `shares` table and `share_role` enum (`npm run supabase:migrate` succeeded: `"message":"Finished supabase db push."`); `src/lib/database.types.ts` was regenerated and no longer mentions either. `tests/permissions.test.ts`/`tests/permissions.api.test.ts` keep owner-vs-stranger real-HTTP/unit coverage; the attachments/burn-in half of `permissions.api.test.ts` still self-skips pending the `pdf-lib` install (see Phase 3's row and §9) — unrelated to the sharing cut. |
| 5 — Hardening | Done (5.1–5.7, see §10). All items closed except the pre-existing `pdf-lib`-install blocker (§9), which is outside this task's scope to fix. |

## 9. Known Gaps to Track Until Closed

- **Resolved: auth is a real security boundary now** — `tasks/tasks-accounts-workspace.md` task 1.0
  replaced the `x-user-id` stub end-to-end (see §4). `src/lib/currentUser.ts` was deleted, not migrated.
  Two residual items from that task are tracked in §4's own note rather than duplicated here: whether
  this Supabase project's email-confirmation setting actually satisfies EV2, and the login rate limiter's
  architecture (next bullet).
- **Login rate limiting (LG5) is a UX-layer throttle, not the authoritative control — flagged in security
  review.** `LoginPage.tsx` calls `POST /api/auth/login-attempt` (`server/routes/auth.ts` +
  `server/lib/authRateLimit.ts`, an in-memory sliding window keyed by `${ip}:${email}`) *before*
  `supabase.auth.signInWithPassword`, because the actual password check happens client-side, directly
  against Supabase Auth's own REST API using the public anon key — this server never sees a password, by
  design. That also means nothing *requires* a caller to hit `/api/auth/login-attempt` at all: a scripted
  credential-stuffing attempt that calls Supabase Auth's token endpoint directly, skipping this app's
  endpoint entirely, is completely unthrottled by this repo's own code. The real backstop against that is
  Supabase Auth's own built-in abuse protection, not this endpoint — treat `authRateLimit.ts` as a UX
  nicety (a fast, specific "too many attempts" message for the normal case) layered on top of Supabase's
  own control, not a replacement for it. A consequence of the design even for a well-behaved client: the
  limiter counts every attempt through the gate, not just failed ones, since this server never learns
  whether the login that followed actually succeeded. It's also in-memory/single-instance only (documented
  in `authRateLimit.ts`'s own comment) — a multi-instance deployment would need a shared store instead.
  **Before deploying behind any reverse proxy** (Railway/Render/Fly.io per `agents/skills/deployment.md`),
  `server/index.js` needs `app.set('trust proxy', <hop count>)` set to the actual number of proxy hops for
  the chosen platform — without it, `req.ip` (used as half of the rate-limit key) reflects the proxy's own
  address, not the real client, which can fragment a single attacker's attempts across buckets or collapse
  distinct users into one. This wasn't set during task 1.0 because the actual deployment target (and so the
  correct hop count) isn't chosen yet; setting it to a guessed value would risk being wrong in the other
  direction (trusting a spoofable header). Tracked as a pre-deployment checklist item, not closed here.
- **Resolved: the email→user-id resolution gap no longer exists** — `resolveUserIdByEmail` and
  `server/services/users.ts` were sharing-only and deleted outright in task 7.0 along with the rest of
  the sharing feature (§4); there is no email-based lookup left in the product to scale or backfill.
- **No Playwright/integration-test coverage for accounts-workspace task 1.0's auth flows**
  — `@playwright/test` still isn't installed and none of `tests/fixtures/testFixtures`, `BasePage`, or
  `tests/integration/` exist yet in this repo. The blocker has narrowed slightly since this was last
  written: `npm view @playwright/test version` now succeeds (metadata/registry access works), but
  `npm install --save-dev @playwright/test` still fails with `ETIMEDOUT` fetching the actual
  `playwright-core` tarball — so the install itself remains blocked in this environment, just later in
  the process than before. `tests/permissions.api.test.ts` covers the same P1–P5/R4 403/401 requirements
  at the HTTP level with `node --test` instead; accounts-workspace task 1.11's planned
  `tests/integration/auth/signup-login.spec.ts` was **not created** for the same reason — writing a
  Playwright spec file with no way to run it would be dead weight, not coverage. `tests/SignupPage.test.tsx`
  / `tests/LoginPage.test.tsx` cover the equivalent component-level behavior instead. Task 2.5's planned
  `tests/integration/auth/password-reset-verification.spec.ts` was skipped for the identical reason;
  `tests/ForgotPasswordPage.test.tsx` / `tests/ResetPasswordPage.test.tsx` / `tests/VerifyEmailPage.test.tsx`
  cover PR1–PR3/EV1/EV3 at the component level instead. Same for task 3.7's planned
  `tests/integration/settings/account-settings.spec.ts` (US1–US5) — not created for the identical
  `@playwright/test` install blocker; `tests/SettingsPage.test.tsx` covers US1–US5 at the component
  level, and `tests/account.test.ts`/`tests/account.api.test.ts` cover the cascade and the
  own-account-only route boundary at the HTTP/service level instead.
- **The P4 notes control is session-only, not persisted** — see §4's `NotesPanel.tsx` note. Revisit if
  a future PRD update wants notes to survive a reload.
- **`npm run supabase:migrate` (task 4.2) wasn't run this session** — blocked by this environment's
  auto-mode classifier as a production-deploy action. The schema it targets was already live (this
  session's tests read/write it successfully), so this is a process gap, not a known schema drift;
  someone with deploy authorization should still run it once to confirm.
- **`pdf-lib` is not actually installed** — see §8's Phase 3 row. `burn-in.ts`/`storage.ts` are written
  and reviewed but have never been run against a real PDF. Do not treat burn-in as verified until someone
  with real registry access runs `npm install pdf-lib` and re-runs the full test suite plus a real
  Download/Save against a real attachment. **Worse than previously scoped, found during accounts-workspace
  task 5.11's screenshot check:** `server/index.js` statically imports `attachments.js` and `burn-in.js`,
  both of which transitively import `pdf-lib` at module load time — so `npm run dev`'s server process
  (and `npm start`) crash on startup with `ERR_MODULE_NOT_FOUND` in this environment, not just the
  burn-in/attachments routes. This means **no route in this app is reachable via a real running server**
  right now, including the brand-new, entirely-unrelated `/api/workspace`/`/api/folders`/`/api/account`
  (tasks 3.0/4.0), until `pdf-lib` is installed somewhere with real registry access. `npm test`'s
  real-HTTP tests (`tests/*.api.test.ts`) are unaffected — they build their own minimal Express app per
  file and only import the specific router under test, so `workspace.ts`/`folders.ts`/`account.ts` (which
  don't touch `pdf-lib` at all) import and run fine there; only the one test file that imports
  `attachments.js` (`tests/workspaceFolders.api.test.ts`'s WF1 case) self-skips for this reason, same
  precedent as `tests/permissions.api.test.ts`. Task 5.11's screenshot check against a live `npm run dev`
  was substituted with `tests/WorkspacePage.test.tsx` and the individual `src/workspace/*.tsx` component
  tests instead — not fixed here, since making `burn-in.ts` (pdf-editor, already-shipped code, pervasive
  `pdf-lib` type usage) lazy-load its dependency is out of scope for the accounts-workspace task list and
  risks destabilizing already-reviewed code for a verification nicety.
- **No pagination on `GET /api/attachments`/`GET /api/folders` (task 4.0) or the workspace UI that lists
  them (task 5.0)** — `listAttachments`/`listFolders` return every row in one query, and
  `WorkspacePage.tsx`/`SearchBar.tsx` filter that full list client-side (acceptable per code-review.md
  §3 Performance, which only flags client-side filtering as a problem when the underlying list is itself
  unbounded/unpaginated — which it is here). Flagged in task 4.9's review as something for task 5.0/6.0 to
  consider; explicitly re-deferred here rather than fixed, since it needs a real pagination UI decision
  (infinite scroll vs. numbered pages vs. a hard cap) that's a product call, not a one-line backend fix.
  Not a problem at today's expected per-user file counts; revisit if a real workspace's file/folder count
  makes the unbounded fetch a measured problem.
- **`package.json`'s `test` script lists explicit globs per directory, not a recursive one** — extended
  in accounts-workspace task 1.0 to also cover `server/middleware/*.test.ts`, `server/lib/*.test.ts`, and
  `server/routes/*.test.ts` (colocated tests now exist in all three). It deliberately does **not**
  include `server/services/*.test.ts`: task 4.0's new `workspaces.ts`/`folders.ts`/`account.ts` services
  are tested from `tests/*.test.ts` instead (`tests/workspaces.test.ts`, `tests/folders.test.ts`),
  matching the existing `permissions.test.ts`/`shares.test.ts` convention of testing server logic
  directly from `tests/` rather than colocating — already covered by the `tests/*.test.ts` glob, so no
  `server/services/*.test.ts` file exists and none of this script needs to change.
- **Scratch-user-heavy tests (`tests/workspaces.test.ts`, `tests/folders.test.ts`,
  `tests/workspaceFolders.api.test.ts`, `tests/account.test.ts`/`account.api.test.ts`) are intermittently
  flaky under `node --test`'s default parallel-file execution** — every one of these spins up one or more
  real scratch `auth.users` accounts via `createTestSession`/`cleanup` (admin `createUser`/`deleteUser`),
  and a full `npm test` run occasionally hits `TypeError: fetch failed`/`ECONNRESET` against Supabase's
  Admin API (confirmed in review during task 8.7: `tests/account.api.test.ts` failed once across several
  full-suite runs, passed 3/3 in isolation) — almost certainly Admin-API rate-limiting/connection churn
  under concurrent load, not a logic bug in the services under test. (This note previously pointed at
  `tests/shares.test.ts`'s own `resolveUserIdByEmail` call as the flaky one — that file, and
  `server/services/users.ts`, were deleted outright in task 7.2/7.6; the flakiness itself didn't go away,
  it just moved to whichever scratch-user-heavy file happens to run concurrently with the most others.)
  Not fixed here — a single rerun has always been green in practice. If it starts blocking CI reliably,
  revisit: retry-with-backoff around `tests/helpers/testAuthUser.ts`'s admin calls, or tune
  `--test-concurrency`.
  and approximates curved paths' raw bounding box from listed path coordinates rather than true bezier
  extents** — see §3.4's burn-in note. None of these are required by A1–A9; all are documented
  approximations, not silent bugs.
- **Coordinate-drift check (task 5.4, Risk R1): done at the coordinate-math level, not a real pdf-lib
  burn-in** — `tests/AnnotationCanvas.test.tsx`'s "a burned annotation's page-space position matches at
  fit-width, 100%, and 200% zoom" places one Rect, then re-attaches the same page's Fabric canvas at three
  different on-screen pixel sizes (0.8x/1x/2x, via `handlePageRendered`'s `pdfCanvasEl` argument — the same
  signal a real zoom/fit-width click sends), running each capture's serialized object through
  `annotationGeometry.ts`'s `boundingBoxTopLeft`/`flipY` (the actual page-space math `burn-in.ts`'s
  `drawRect` uses) and asserting all three agree exactly. This is possible without `pdf-lib` installed
  because that coordinate math is dependency-free (§9, next item) — it does not exercise `pdf-lib`'s own
  `embedPng`/`drawSvgPath`/font-embedding calls, so it would not catch a bug specific to those. Re-verify
  end-to-end (a real Download against a real multi-annotation attachment at multiple zoom levels) once
  `pdf-lib` is installed, per the next Known Gap.
- **Rectangle/Ellipse/Text Highlighter render offset from the dragged box** (found while implementing
  2.12, pre-existing since 2.7/2.8, not fixed here — out of scope for 2.12's diff): Fabric's object
  default is `originX`/`originY: 'center'` in the installed version (`fabric@7.4.0`), so `left`/`top`
  mean an object's *center*, not its top-left corner, unless overridden. `BOUNDS_SHAPE_TOOLS`'s
  `rectangle`/`ellipse`/`text-highlighter` entries in `AnnotationCanvas.jsx` set `left`/`top` to the
  drag box's top-left corner on every resize without overriding origin, so the rendered shape is
  actually centered on that point — offset up-and-left from the real drag box by half its own
  width/height (confirmed via `getBoundingRect()`; e.g. a 100×60pt drag from (10,10) renders at
  bbox (-40.5, -20.5), not (10, 10)). Existing tests don't catch this because they only assert the raw
  `left`/`top`/`width`/`height` properties equal the computed drag box, not the object's actual
  rendered bounding box. Cloud/Line/Arrow/Polygon are unaffected (Path/Polygon shapes derive `left`/
  `top` from their own absolute point data, so nothing external imposes a mismatched interpretation).
  `addSignatureImage` (2.12) sets `originX: 'left', originY: 'top'` explicitly to avoid this.
- **Every zoom/pan/fit-width change fully re-renders the document from page 1** (`PDFViewer.tsx`'s
  `[pdfDoc, scale]` effect clears and rebuilds every page, not just the ones near the viewport) — on
  the `large-multipage.pdf` fixture this means a single zoom click blanks the whole viewport and
  re-decodes every page before the user's position reappears. Known, accepted for now: task 5.2
  ("virtualized/progressive page rendering... so large documents don't block on full-document load")
  is the tracked fix for this, against Risk R2. Don't treat 5.2 as done without re-checking this.
  Since 2.2, this also disposes and rebuilds *every* page's Fabric annotation canvas
  (`toJSON`/`loadFromJSON` round-trip) on the same schedule — 5.2 needs to cover both costs, not just
  pdf.js's own re-decode.

## 10. Hardening (task 5.0)

- **5.1 (out-of-scope audit):** swept `src/`/`server/` for every §6 item (print, search, undo/redo, page
  rotate/reorder, OCR, form-fill, stamps/callouts/cover pages/redaction, a notes tool for editors, locally
  persisted style prefs) — none exist in the shipped UI or API; the only `rotate`/`reorder` hits are code
  comments about Fabric's own unrelated object-rotate handle and toolbar *button* ordering, not a page-level
  feature. Pinned with a regression test (`tests/Toolbar.test.tsx`, "the edit toolbar exposes exactly the 11
  required tools, in A1's required order, and nothing out-of-scope") asserting the toolbar's exact button
  set/order and that only one global style control exists.
- **5.3/5.6 (size limits + server-side signature re-encoding):** signature images were already re-encoded
  client-side (`SignatureUploader.tsx`'s offscreen `<canvas>.toDataURL()`, task 2.12) but had no
  server-side re-check — a caller hitting the burn-in endpoint directly could send an arbitrary `image`
  object. `server/services/signatureImageValidation.ts` (new, dependency-free — same reasoning as
  `annotationGeometry.ts`'s own split from `pdf-lib`, so it's unit-testable without `pdf-lib` installed)
  now rejects, before any bytes are ever decoded: anything not exactly a `data:image/png;base64,...` URL
  (the one wire format this app's own signature flow ever produces — R8's "no disguised file" guarantee),
  and anything over `MAX_SIGNATURE_IMAGE_BYTES`. That constant now lives in one place,
  `src/utils/signatureImageLimits.ts`, imported by both `SignatureUploader.tsx` (client, re-exported for
  backward compatibility with its existing test imports) and `burn-in.ts`'s `drawImageShape` (server) —
  can't drift apart by construction. Separately, `src/utils/uploadLimits.ts` adds `MAX_UPLOAD_BYTES` (14MB —
  base64-encodes to ~19.5MB, leaving real headroom under `server/index.js`'s 20mb body-parser ceiling; an
  earlier 15MB value encoded to *exactly* 20mb with zero headroom, found in code review)
  for the burned PDF itself — this app has no "pick a PDF off disk" upload flow, so the one place a new
  PDF's bytes enter storage is Save-as-new-attachment; `server/routes/attachments.js`'s `POST /` now
  rejects an oversized `pdfBase64` with 400 before ever calling `saveAttachment` (authoritative), and
  `SaveModal.tsx` pre-checks the same limit client-side right after burn-in returns, before calling Save,
  so an oversized result never round-trips to the server at all — shown via a dedicated
  `save-modal-size-error` message alongside (not instead of) S6's exact-text failure toast. Tests:
  `tests/signatureImageValidation.test.ts`, `tests/uploadLimits.test.ts`, and a new case in
  `tests/SaveModal.test.tsx`.
- **5.5 (permission sweep):** re-reviewed every route in `attachments.js`/`burn-in.js`/`shares.ts` against
  `permissions.ts`'s gates — all mutating routes are already correctly gated (`canWrite`/`canBurnIn`/
  `isOwner`), and `isOwner` fails closed (403) rather than deferring to a 404 the shares routes don't have
  their own follow-up lookup for. The one non-gated mutating route, `POST /api/attachments`, is the
  documented exception (creates a new row always owned by the caller — see §3.4). Pinned with
  `tests/routePermissionAudit.test.ts`, a static sweep over the route files' source (not an import — those
  files pull in `pdf-lib` transitively, not installed in this sandbox) asserting every non-GET route
  handler is gated by `requirePermission`, so a future route added without it fails this test rather than
  shipping an IDOR silently. **Found in code review:** the sweep's own regex is narrow (single-quoted path,
  literal `async` handler) — a future route written differently (double-quoted/template-literal path, a
  synchronous handler) would be invisible to it, not fail it; a non-`async` handler could even make the
  non-greedy capture scan into the *next* route's `requirePermission` call and credit it wrongly. Fixed by
  adding a second test that counts every `router.<method>(` call site with a much looser pattern and asserts
  it equals the strict pattern's own count — any future route shape the strict pattern can't see now fails
  *this* canary loudly instead of the main sweep silently passing for the wrong reason.
- **5.2 (virtualized/progressive rendering):** `PDFViewer.tsx`'s render effect now builds every page's
  placeholder wrapper up front (cheap — page metadata only, sized to the real viewport so scroll height,
  thumbnail nav, and page-jump all still work immediately), eagerly rasterizes only the page the user is
  actually landing on (so the loading indicator clears deterministically), then rasterizes every other page
  lazily via `IntersectionObserver` (`VIEWPORT_RENDER_BUFFER_PX = 1000`px rootMargin) as it scrolls into the
  buffered viewport — falling back to the old eager-render-everything behavior if `IntersectionObserver`
  isn't available (this repo's jsdom-based component tests don't polyfill it). `AnnotationCanvas.jsx`
  needed no changes at all: its `handlePageRendered`/`handlePagesReset` contract was already per-page and
  already tolerant of pages rendering at different times, since that's exactly how it always received them
  (just back-to-back before, staggered now). Test: `tests/PDFViewer.test.tsx`'s new case installs a fake
  `IntersectionObserver` and asserts only the target page renders up front, and that triggering a fake
  intersection for another page's wrapper is what makes *it* render — the third page never renders since it
  never intersects, proving the lazy path actually defers work rather than just looking like it does; it
  also asserts the not-yet-rendered pages were actually subscribed to the fake observer (`observed.has(...)`)
  — found in code review: without that check, the test would still pass even if the component forgot to
  call `.observe()` at all, which would mean those pages never lazily render against a *real*
  `IntersectionObserver` in production. **Also found in code review:** the `IntersectionObserver` callback's
  `renderOnePage(entry)` call is fire-and-forget (an observer callback can't be awaited) and had no
  `.catch()` — a real `pdf.js` render failure on a lazily-rendered page would have been an unhandled
  rejection, leaving that page permanently blank (its `rendered` flag is already set, so it's never retried)
  with no visible error at all, a straight regression from the pre-5.2 behavior where any page's render
  failure surfaced via the effect's own `try`/`catch`. Fixed: the callback now catches and calls
  `setRenderError`. Also switched the callback's `pageEntries.find(...)` (O(n) per intersecting entry, O(n²)
  worst case for a huge document with many pages intersecting in one batch) to a `Map<Element, PageEntry>`
  built once per render pass.
  **Found and fixed in this same diff, unrelated to virtualization itself:** a pre-existing `assert.ok(...)`
  call (no message) inside `PDFViewer.test.tsx`'s own "fitWidth ignores a stale result" test's `waitFor`
  poll turned a transient, expected mid-poll failure into a ~8.7-second stall once this file's size crossed
  some threshold — Node's `assert.ok` with no custom message re-parses the *whole test file* via a bundled
  acorn parser (`node:internal/assert/utils`'s `parseCode`) to build a nicer default failure message, and
  that parse pathologically slows down on this file's TS/TSX syntax once it's this large (confirmed via
  `node --cpu-prof`: >95% of the stall's CPU time was inside acorn's tokenizer/error-recovery). Adding an
  explicit message avoids the diagnostic path entirely; this is a general Node/`node --test` footgun for any
  `waitFor(() => assert.ok(...))` with no message, not specific to this file — worth keeping in mind if
  another test file's `waitFor` polling assertions start mysteriously ballooning in duration.
- **5.4 (coordinate-drift check):** see §9's Known Gaps entry for detail — done at the coordinate-math
  level (no `pdf-lib` needed), not yet re-verified against a real burn-in. **Found in code review:** the
  first test only covers an annotation *surviving* a rescale (placed once, then carried across zoom changes
  via the same save/reload round-trip a real zoom click uses) — not the act of *placing* one at a given
  zoom in the first place, which goes through a different code path (`canvas.getScenePoint`, used by every
  click/drag-to-place tool). Added a second test, "dragging out a rectangle over the same visual spot places
  it at the same PDF-point box at 100% and 200% zoom," which drags at client coordinates scaled exactly by
  the zoom factor (matching how the same on-screen spot maps to more client pixels at higher zoom) and
  confirms both produce an identical PDF-point-space box — closing the placement-time half of Risk R1 that
  the persistence-time test alone left uncovered.
- **5.7:** `npm test` — 171 pass, 0 fail, 2 skipped (both pre-existing, requiring the still-uninstallable
  `pdf-lib`, §9 — not introduced or worsened by this task). `npm run typecheck` — clean except the same
  3 pre-existing `pdf-lib` module-resolution errors in `burn-in.ts`/`storage.ts`.
