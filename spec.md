# spec.md — In-Workspace PDF Editor

Source of truth: `pdf_editor_prd.pdf` (external, not checked into this repo) → distilled into
`tasks/tasks-pdf-editor.md`. This document is the living spec derived from both, kept in sync with
actual behavior as each task lands. It covers the PDF Editor feature only — the separate
accounts/workspace track (`tasks/tasks-accounts-workspace.md`) is out of scope here; none of it is
built yet, and this document assumes the pre-existing attachment/permission model it will eventually
replace.

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

## 4. Permissions Model (P1–P5)

Target end state — server-side enforced, independent of anything the UI hides:

- **P1** — An owner grants another user access to an attachment by email address.
- **P2** — A recipient gets **Edit** only if they hold edit permission *and* are a recognized existing
  app user (verified identity, not a client-supplied header); otherwise **View-only**. This covers both
  external users and internal users without edit rights.
- **P3** — View-only hides all annotation tools and the Save button.
- **P4** — View-only shows a "notes" annotation control instead — the *only* notes affordance in the
  product (distinct from, and not to be confused with, the excluded general notes tool for editors —
  see §6).
- **P5** — No permission (or a file that no longer exists) → a defined empty state, never a blank
  screen or generic error.

Default-deny: access exists only via an explicit grant.

**Implementation (task 4.0):**
- `server/middleware/permissions.ts` — `canRead`/`canWrite`/`canBurnIn` (pre-existing) plus `isOwner`
  (owner-only gate for share management) and `getAttachmentRole` (returns `'owner' | 'edit' | 'view' |
  'none'`, used by the viewer to decide what to render).
- `server/services/shares.ts` + `server/services/users.ts` — `listShares`/`createShare`/`removeShare`
  against the `shares` table; `createShare` resolves the grantee's email to a `grantee_user_id` via
  `resolveUserIdByEmail` (best-effort, `supabase.auth.admin.listUsers()` — there's no `profiles` table
  and `auth.users` isn't exposed over PostgREST, so this pages through users and matches client-side;
  doesn't scale past one page of 1000 and should be replaced once accounts-workspace adds a `profiles`
  table). Unresolved emails are still stored (so they show up in the share list) but grant nothing —
  `canRead`/`canWrite` match on `grantee_user_id`, never on email — until some future reconciliation
  step backfills it; no such backfill exists yet, so P2's "otherwise view-only" is really "otherwise
  nothing" today for an unregistered email, not a degrade-to-view-only. Re-sharing to the same email
  upserts (updates the role) rather than erroring on the table's unique `(attachment_id,
  grantee_email)` constraint.
- `server/routes/shares.ts` — `GET/POST /api/attachments/:attachmentId/shares` (list/grant) and
  `DELETE /api/attachments/:attachmentId/shares/:shareId` (revoke), all gated by
  `requirePermission(isOwner)` — mounted in `server/index.js` with its own `:attachmentId` param
  (`Router({ mergeParams: true })`), not nested inside `attachments.js`'s router, per this task list's
  Relevant Files split. **Never returns the internal `Share` shape directly** — `toClientShare()` strips
  `granteeUserId`/`grantedBy` before `res.json(...)`. Found in code review: with identity still the
  `x-user-id` header stub, sending another real user's `auth.users` UUID to the browser would have let
  anyone who read a `GET .../shares` response impersonate that grantee on every other route by setting
  it as their own `x-user-id` (`src/lib/currentUser.ts`) — not a cosmetic leak, an authorization bypass.
  Regression-tested in `tests/permissions.api.test.ts` (asserts neither key is present on either
  endpoint's response).
- `server/routes/attachments.js`'s `GET /:id` now also computes `getAttachmentRole(req.userId, ...)`
  and includes it as `role` on the response — the one signal `ViewerPage.jsx`/`Toolbar.jsx` use to
  decide what to render (P3/P4).
- `src/modals/ShareModal.tsx` — owner-only modal (Share button only renders for `role === 'owner'`,
  matching P1's "an owner grants access," not an edit-share holder): email + edit/view select, submit
  grants, lists current shares, each with a Revoke button. Validates the shape of every
  `fetchShares`/`createShare` response with a runtime `isShare` guard (mirroring
  `usePdfDocument.ts`'s `isAttachmentDownload`) before trusting it, rather than a bare `as Share` cast —
  added in review after the first version skipped this check.
- `src/toolbar/Toolbar.jsx` — `role` prop (`'owner' | 'edit' | 'view' | undefined`) gates the annotation
  tool buttons, `StyleControls`, and the Save button (hidden — not just visually hidden, absent from the
  DOM — for `role === 'view'`); the Share button only renders for `role === 'owner'`. `role === undefined`
  (no prop passed) keeps the pre-4.0 full-toolbar behavior for backward compatibility with
  `tests/Annotator.test.tsx`'s harness. Download stays visible regardless of role — P3 only names the
  annotation tools and Save; see the known-gap note below for why that's an inherited, not new, rough
  edge. **`ViewerPage.jsx` passes `role={loading ? 'view' : attachment?.role}`, not the raw
  `attachment?.role`** — found in review: `attachment` is `null` for the whole initial fetch, and
  `attachment?.role !== 'view'` (i.e. `undefined !== 'view'`) was `true` during that window, so
  `Toolbar.jsx`'s own back-compat default then briefly showed full edit affordances before the real
  role resolved. Treating "not yet known" the same as `'view'` (default-deny) closes that window.
- `src/viewer/ViewerPage.jsx` also passes `activeTool={null}` to `AnnotationCanvas.jsx` for a
  view-only role — hiding the toolbar's tool buttons alone isn't enough, since
  `AnnotationCanvas.jsx`'s `applyActiveTool` keys `isDrawingMode`/pointer-events entirely off
  `activeTool`, and the default tool is `'pen'`; without this, a view-only session could still draw
  via the canvas with no visible button ever having triggered it. A non-tool-id value makes every one
  of `AnnotationCanvas.jsx`'s tool-membership checks false, disabling the overlay's pointer-events
  entirely.
- `src/viewer/NotesPanel.tsx` — the P4 "notes" control, rendered by `Toolbar.jsx` only when
  `role === 'view'`. Deliberately **not** wired into burn-in/save (a view-only session has no edit
  permission for those endpoints regardless) and **not persisted anywhere** — there is no notes table
  or endpoint anywhere in this task list, so this is a session-only/local-to-the-tab list of text notes.
  This is a scoping decision made while implementing 4.7, not a PRD requirement — flag it if a future
  PRD update wants notes to survive a reload.
- `src/viewer/NoAccessState.tsx` + `src/viewer/usePdfDocument.ts`'s new `accessDenied` flag — when the
  attachment fetch fails with 401/403/404, `ViewerPage.jsx` renders `NoAccessState` instead of the
  toolbar/viewer/etc. entirely (P5), rather than showing the generic error string inside the normal
  layout the way any other fetch failure does.
- `src/lib/http.js`'s `request()` now attaches `.status` to the `Error` it throws on a non-2xx response
  (needed for the `accessDenied` check above), and, on the client, attaches an `x-user-id` header read
  from `src/lib/currentUser.ts` — see the known-gap note below.

**Current implementation gap:** `server/middleware/permissions.ts` implements the read/write/burn-in/
owner/role checks against the `shares` table correctly, but every route still identifies the caller from
a client-supplied `x-user-id` header (`requirePermission` in `server/middleware/permissions.ts`), not a
verified Supabase JWT. Until real auth lands (tracked as task 1.6 in `tasks/tasks-accounts-workspace.md`),
P1–P5 are enforceable in test/dev but **not safe against a malicious client**, which can simply send
someone else's user id. Treat this as the bar to build to, not the current guarantee — flag it in any
security review until closed.

**New client-side half of that same stub:** before task 4.0, the browser never sent `x-user-id` at all
(every attachment fetch would have 401'd against the real server). `src/lib/currentUser.ts` adds a
localStorage-backed `getCurrentUserId`/`setCurrentUserId` so a manual tester can act as different users
(owner vs. a share recipient) across tabs/reloads without a real login flow, and `http.js` sends it on
every request. This is explicitly scoped as "just enough to exercise P1–P5 by hand and in tests" — it is
not a login UI, has no signup, and should be deleted wholesale (not extended) once `requireAuth`/a
verified Supabase JWT lands.

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
per-annotation individual styling · a general notes/comment tool for edit users (the only notes
affordance is the view-only P4 control) · cover pages, stamps, callouts, redaction, or any annotation
type not in A1–A8 · direct editing of underlying PDF content (text/images) · OCR, form-filling, or
legally-binding e-signature · real-time multi-user co-editing · cross-session undo/version history ·
page import/blank-page/reorder/rotate (stretch, ST2) · locally persisted style preferences (stretch,
ST1).

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
5. An owner can grant edit/view by email; a non-edit recipient gets the view-only experience (no tools,
   no Save, a notes button instead); no-access or dead link gets the empty state. — **§4**. Note:
   Download itself stays visible for a view-only session (P3 only names the annotation tools and Save) —
   clicking it still 403s today, since Download is implemented via the burn-in endpoint (edit-only); a
   plain "download the original, unannotated file" path for view-only users isn't in this task list.
6. None of the §6 out-of-scope items has been added to the shipped UI or API.

Success metrics for grading whether each is *actually* met (checkable by a second person, not just
self-reported):

| Metric | Target |
|---|---|
| Annotate-and-save completion | ≥ 95% of Save attempts on valid input end in a success toast |
| Burn-in fidelity | On-screen vs. burned position/size match within a defined tolerance at fit-width, 100%, 200% zoom |
| Permission enforcement | 0 successful edit/save actions from a view-only session, **including via direct API calls** |
| Filename validation | 100% of F4–F6 boundary cases trigger correctly in tests |
| Empty-state coverage | 100% of no-permission / not-found cases render the defined empty state |

## 8. Current Implementation Status

Tracked in detail in `tasks/tasks-pdf-editor.md`. Snapshot:

| Phase | Status |
|---|---|
| 1 — Viewer (V1–V8) | Done (1.1–1.10): render/scroll/loading/thumbnails, page navigator, zoom in/out, pan, fit-width, confirmed absence of default pdf.js print/search UI, and component tests for `PDFViewer`/`PageNavigator`. |
| 2 — Annotation tools (A1–A9) | Done (2.1–2.14; 2.15's tests land alongside): Fabric.js installed (2.1); `AnnotationCanvas.jsx` layers a per-page Fabric canvas normalized to PDF-point space, coordinated with `PDFViewer.tsx`'s destructive re-renders (2.2). Pen/Freeform Highlighter (2.4/2.6), Text (2.5), Text Highlighter (2.7), Rectangle/Ellipse (2.8), Line/Arrow (2.8), Cloud (2.9), the global style control (`StyleControls.tsx`, 2.10), Polygon (2.11), Signature (2.12), select/move/resize (2.13, A5), and the delete-confirmation modal (2.14, A6) are implemented. Signature (`SignatureUploader.tsx`): validates type/size client-side, re-encodes the upload through an offscreen `<canvas>` before placing it (A8/R8's client-side half — the *authoritative* server-side re-check/re-encode is still task 5.3/5.6, not done), and places it via `AnnotationCanvas.jsx`'s `addSignatureImage` at a default width (clamped to the page's own width) on whichever page is currently on screen. Select/move/resize (2.13): see §3.2's A5 note for the Pen/Freeform Highlighter fix this required. Delete (2.14): see §3.2's A6 note. |
| 3 — Download & Save (D1–D3, S1–S8, F1–F6) | Implemented (3.1–3.11): burn-in (`server/services/burn-in.ts` + `annotationGeometry.ts`), save-as-new-attachment (`server/services/storage.ts`'s `saveAttachment`/`downloadAttachmentBytes`), `src/utils/filenameUtils.ts` (F1–F6, shared client/server), `SaveModal.tsx`, and the Download/Save toolbar wiring in `ViewerPage.jsx`/`Toolbar.jsx`. **Blocked on dependency install:** `pdf-lib` could not actually be installed in the session that wrote this — the sandboxed environment's network access to `registry.npmjs.org` timed out, and redirecting to the Autodesk Artifactory mirror was itself blocked by the harness's own policy. `server/services/burn-in.ts` and `storage.ts` are written against `pdf-lib`'s documented API but have never actually been run — `npm run typecheck` currently fails on exactly those two files' `pdf-lib` import (nothing else). **Action needed:** run `npm install pdf-lib` in an environment with real registry access, then re-run `npm run typecheck` and `npm test` (particularly exercise a real Download/Save against a real attachment) before treating burn-in as verified rather than reviewed-but-unrun. The coordinate math those two files depend on (`annotationGeometry.ts`) has no such dependency and *is* unit-tested (`tests/annotationGeometry.test.ts`). |
| 4 — Permissions & sharing (P1–P5) | Implemented (4.1–4.11, see §4's "Implementation" note): `shares` table (4.1, pre-existing); `isOwner`/`getAttachmentRole` added to `permissions.ts`; grant/list/revoke endpoints (`server/routes/shares.ts`, 4.4); `ShareModal.tsx` (4.6); `Toolbar.jsx` role-gating + `NotesPanel.tsx` (4.7); `NoAccessState.tsx` wired via `usePdfDocument.ts`'s `accessDenied` (4.8/4.9); unit tests (`tests/permissions.test.ts`, `tests/shares.test.ts`) and real-HTTP 403/401 tests (`tests/permissions.api.test.ts`, 4.10/4.11) — the burn-in/attachments half of that last file self-skips pending the `pdf-lib` install (see Phase 3's row and §9); the shares-endpoint half runs for real against the live Supabase project. Identity is still the `x-user-id` header stub, now with a client-side half too (see §4 gap notes) — not yet a security boundary. `npm run supabase:migrate` (4.2) itself wasn't run this session — it's a production-deploy-classified command this environment's auto-mode blocked; the migration it would apply was already applied in an earlier session (confirmed indirectly: `tests/permissions.test.ts` already passes reads/writes against the real `shares` table). Playwright-level coverage of P1–P5 (`agents/rules/integration-tests.md` §8/§15) doesn't exist yet — `@playwright/test` and the `tests/fixtures/testFixtures`/`BasePage` scaffolding aren't installed in this repo, for the same npm-registry-access reason as the `pdf-lib` gap; `tests/consts/inkSpace.ts`/`routes.ts` were extended with the new `SHARE_*`/`NOTES_PANEL_*`/`TOOLBAR` test ids and `Routes.Shares`/`ShareById` (replacing the stale `Permissions`/`PermissionById`/`AttachmentDownload` entries) so that suite can be written directly against this implementation once the tooling exists. |
| 5 — Hardening | Not started (depends on 2–4). |

## 9. Known Gaps to Track Until Closed

- **Auth is a stub, not a security boundary yet** — see §4. Do not treat P1–P5 as satisfied until
  `requirePermission` reads identity from a verified Supabase JWT instead of `x-user-id`. As of task
  4.0 the client also has a matching localStorage-backed identity stub (`src/lib/currentUser.ts`) — it
  needs to be deleted, not migrated, when real auth lands.
- **Email→user-id resolution doesn't scale and has no backfill** — `resolveUserIdByEmail` pages through
  `supabase.auth.admin.listUsers()` (no email filter exists on that API) and stops at 1000 users; and a
  share granted to an email that doesn't have an account yet is stored but grants nothing until some
  future step re-resolves it — no such step exists. Replace both once accounts-workspace adds a
  `profiles` table.
- **No Playwright/integration-test coverage for P1–P5 (or anything else in this task list)** —
  `@playwright/test` isn't installed and none of `tests/fixtures/testFixtures`, `BasePage`, or
  `tests/integration/` exist yet in this repo, blocked by the same npm-registry access issue as
  `pdf-lib` below. `tests/permissions.api.test.ts` covers the same P1–P5/R4 403/401 requirements at the
  HTTP level with `node --test` instead.
- **The P4 notes control is session-only, not persisted** — see §4's `NotesPanel.tsx` note. Revisit if
  a future PRD update wants notes to survive a reload.
- **`npm run supabase:migrate` (task 4.2) wasn't run this session** — blocked by this environment's
  auto-mode classifier as a production-deploy action. The schema it targets was already live (this
  session's tests read/write it successfully), so this is a process gap, not a known schema drift;
  someone with deploy authorization should still run it once to confirm.
- **`pdf-lib` is not actually installed** — see §8's Phase 3 row. `burn-in.ts`/`storage.ts` are written
  and reviewed but have never been run against a real PDF. Do not treat burn-in as verified until someone
  with real registry access runs `npm install pdf-lib` and re-runs the full test suite plus a real
  Download/Save against a real attachment.
- **Burn-in does not reproduce Fabric object rotation, uses a fixed Helvetica font for all burned text,
  and approximates curved paths' raw bounding box from listed path coordinates rather than true bezier
  extents** — see §3.4's burn-in note. None of these are required by A1–A9; all are documented
  approximations, not silent bugs.
- **No coordinate-drift check exists yet** (Risk R1, task 5.4) — needed before Phase 2/3 can be called
  done; would also be the first place a rotation/curve-approximation gap above would actually show up
  numerically.
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
