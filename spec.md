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
| Burn-in (server) | `pdf-lib` | Writes the overlay's vector content into a **new** PDF, server-side — the persisted file must not be solely a product of client-side code the user can alter. |
| Auth / DB / Storage | Supabase (Postgres + Storage) | `attachments`, `attachment_drafts`, `workspaces` and `folders` tables (see `supabase/migrations/`; the old `shares` table was dropped, §4); signed, time-bounded URLs for file access. |
| Backend | Node + Express | Four-verb endpoints (fetch/create/change/remove) against attachments (plus draft and page-edit endpoints), workspace, folders, account and burn-in. |

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
- **Wheel / pinch zoom (implemented):** in the viewer, `Ctrl`/`Cmd` +
  mouse wheel and a trackpad pinch (browsers report pinch as a wheel event with `ctrlKey` set) zoom the
  document through the same `zoomIn`/`zoomOut` pipeline as the buttons — same 25% steps, same 50%–300%
  clamp. `PDFViewer.tsx` attaches a native, non-passive `wheel` listener to the scroll container (React's
  `onWheel` is passive and can't `preventDefault` the browser's own page zoom). Deltas are accumulated and
  one step fires per 40px (`WHEEL_ZOOM_THRESHOLD`), so a pinch's stream of tiny deltas doesn't trigger a
  full re-render each; events arriving mid-render are swallowed (still `preventDefault`'d). A plain wheel
  or two-finger scroll without `Ctrl`/`Cmd` scrolls normally. Zoom is not anchored to the cursor.
- **Viewer layout (implemented):** the zoom control (Fit width, −, level, +) is a small, muted bar in its
  own row *above* the document, right-aligned (`PDFViewer.tsx`'s `.pdf-viewer-column` wraps the zoom bar
  and the scrolling `.pdf-viewer`), not an overlay inside the scroll area — previously it scrolled with
  the content and ended up on top of the page when zoomed in.
- **HiDPI rendering (implemented):** page and thumbnail canvases are backed by device pixels
  (`window.devicePixelRatio`, capped at 3; `PDFViewer.tsx`, `ThumbnailPanel.tsx`) and sized in CSS pixels
  via `canvas.style.width/height`, so they stay sharp on Retina screens. `AnnotationCanvas.jsx` therefore
  sizes its Fabric canvas from the PDF canvas's CSS size (`style.width/height`), not its bitmap
  `width/height`, so annotations still line up with the page.
- **Opening a file (implemented):** clicking a file name in the workspace list, or a thumbnail in Recent,
  opens the annotation viewer (`/edit/:id`). There is no separate read-only preview route or per-row Edit
  button — `/view/:id`, `ViewerPage`'s `readOnly` mode and the `file-actions-open` control were removed.
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
- Toolbar, fixed left-to-right order: Hand → Pen (default) / Freeform highlighter → Text → Ellipse (default) / Rectangle / Line / Arrow (one-sided) → Cloud → Signature
  (upload image) (A1), then the **Document editor** button (§3.2, below). Every annotation tool is an individually visible button, not collapsed into group dropdowns —
  "(default)" only marks which tool is initially active (Pen, on mount) and which shape tool is
  active if the user hasn't picked a different one; each tool still gets its own always-visible icon
  button (`Toolbar.jsx` + `toolbarIcons.tsx`, inline SVG, no icon-library dependency). **Hand (implemented)**
  is the button at the far left (`tool-hand`): it draws nothing and only lets the user select, move
  and resize existing annotations (the overlay takes pointer input only when the press lands on an
  annotation, so dragging empty page area still pans the viewer). It has no style popover. Pen is still
  the tool active on mount.
- **Toolbar header (implemented):** a larger bar (more padding, 2.75rem tool buttons) with the file
  *name* only on the left (no id, no "Attachment:" prefix; truncated with an ellipsis and full name on
  hover, so every tool stays visible without scrolling), then the tools, the Document-editor button, the draft-status text (see Draft autosave below), Download and
  Save, and a round "×" **Back** button (`back-button`) at the far right. Back flushes the autosaved draft
  and navigates to `/workspace`; only if that flush fails does it open the "Go back?" confirmation (card
  variant, body "Are you sure you want to go back? All unsaved changes will be lost.", confirm "Go back").
  Tool buttons (and the Document-editor button) show a hover/focus tooltip with the tool's name
  (`.file-button-tooltip`).
- **After drawing, the toolbar returns to Hand (implemented):** finishing a creation gesture selects the
  new annotation and calls `onObjectCreated`, which `ViewerPage.jsx` wires to `setActiveTool('hand')`, so
  the next drag moves/resizes it instead of starting another shape.
- All line-based marks render solid only (A2); opacity fixed at 100%, not configurable (A3).
- **Per-tool style (A4, revised, implemented)** — each annotation tool has its own color (default red
  `#dc2626`) and stroke width (default 4pt); the **Text** tool instead has color, **font family** (Helvetica / Times New Roman / Courier New) and **font size** (default 16pt, `StyleControls`' `showFont`; burn-in maps the family to the matching PDF standard font); closed shapes (Rectangle, Ellipse, Cloud) additionally have an optional **fill** (a checkbox plus its own color picker, `style.fill`; unchecked/`null` = outline only, the default). `ViewerPage.jsx` keeps a map (`stylesByTool`) and passes the active tool's style (falling
  back to `DEFAULT_ANNOTATION_STYLE`) to `Toolbar.jsx` and `AnnotationCanvas.jsx`, so switching tools
  never overrides another tool's configuration. The controls (`StyleControls.tsx`) render in a
  tooltip-style **popover under the selected tool's button** (`.toolbar-style-popover`), which stays open
  until another tool is chosen (none for Hand). Text shows color, font and size (no stroke).
  The color control is a custom `ColorPicker.tsx` (rounded swatch; panel with a saturation/brightness
  area, hue slider, and small, rounded Hex / R,G,B / H,S,L fields; closes on outside click or Escape)
  instead of `<input type="color">`, whose native popup can't be styled; it still emits `#rrggbb`. Every
  tool's creation path (free-drawing brush color/width, `BOUNDS_SHAPE_TOOLS`'s `create`/`resize`,
  `buildArrowPath`/`buildLineOrArrow`/`buildCloudShape`, `placeTextbox`) reads `style.color`/
  `style.strokeWidth` instead of the old hardcoded `BASE_STROKE_COLOR`/`BASE_STROKE_WIDTH`
  constants (removed) — changing a control affects annotations placed *after* the change, not ones
  already on the canvas, **unless** one of them is currently selected, in which case it also restyles
  live (see below) — but only for a style edit within the same tool: a tool switch swaps `style` without
  the user editing it, so that restyle effect skips it (`styledToolRef`) and never repaints the selection.
  `HIGHLIGHTER_OPACITY` (0.35) is the one hardcoded exception, kept as a constant
  rather than folded into `style` — per A3, it's a fixed property of the Freeform/Text Highlighter tools
  themselves, never a user-facing control, so it has no business being part of the style.
  Every created object is tagged with which tool made it (`object.set('annotationTool', toolId)`, via a
  `tag()` helper called at the end of every creation path) — this is what lets the "unless re-selected"
  behavior interpret `style` correctly for an arbitrary already-placed object (e.g. text's color lives in
  `fill`, a line's in `stroke`, closed shapes take `style.fill`) without re-deriving
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
  fixed constant, and is always filled solid with `style.color`, since an arrow requires a filled head.
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
  **Bold / italic / underline (implemented):** while a Textbox is being edited, `Ctrl`/`Cmd`+`B` / `I` /
  `U` toggle `fontWeight` (`bold`/`normal`), `fontStyle` (`italic`/`normal`) and `underline` on the
  *whole* textbox (object-level, not per-selected-character — so burn-in needs no per-character style
  handling). `AnnotationCanvas.jsx`'s document-level `keydown` handler (`toggleTextFormat`) handles them
  only when the active object is a Textbox with `isEditing`, and `preventDefault`s them so the browser's
  own shortcut (e.g. Firefox's bookmarks sidebar on `Ctrl+B`) doesn't fire. Burn-in honours all three (see
  §3.4 burn-in notes).
- **Text selection markup (implemented, editor only):** `PDFViewer`'s `textLayer` prop (passed by the
  editor, not the read-only preview — V8 still holds there) builds a pdf.js `TextLayer`
  (`.pdf-text-layer`, transparent selectable spans, `cursor: text`) over each rendered page, *under*
  Fabric's overlay. With the **Hand** tool, the overlay's upper canvas takes pointer events only while
  the cursor is over an annotation and steps aside (`pointer-events: none`) over bare text, so hovering
  text shows an I-beam and dragging selects it natively; a press on bare page area deselects any selected
  annotation, and dragging across text selects instead of panning. Once a selection settles,
  `TextMarkupToolbar.tsx` shows a floating **Strikethrough / Highlight / Underline** picker above it;
  choosing one calls `AnnotationCanvas`'s `addTextMarkup(kind, clientRects)`, which merges the selection's
  rects into one box per line (`textMarkup.ts`) and adds real annotation objects in PDF-point space —
  Highlight = translucent yellow `Rect`, Underline/Strikethrough = red `Line` (tagged `text-highlight` /
  `text-underline` / `text-strikethrough`) — then clears the selection. They burn in through the existing
  Rect/Line paths. Known limits: a multi-line selection creates one object per line (each deleted
  separately); colors are fixed (not the style popover's); selection needs the Hand tool (the editor's
  default is Pen); the underline/strike positions are proportions of the line box, not font metrics.
- **Rectangle, Ellipse, Cloud (A1/A2/A4/A7, implemented)**: all three drag out a
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
  Cloud default to `fill: style.fill ?? null` (outline only unless the user ticks the fill option)
  with `stroke: style.color`/`strokeWidth: style.strokeWidth`, no dash array
  (A2: outlines render solid). Rectangle and Ellipse are created with `originX/originY: 'left'/'top'`
  (Fabric 7 defaults to a center origin) so the press point stays one corner of the box, and their
  `resize` subtracts the stroke width (painted half inside, half outside the geometry) so the outline's
  outer edge lands on the cursor. Ellipse's `.width`/`.height` are derived from `rx`/`ry`, so its
  `resize` sets `rx/ry = max(0, size − strokeWidth) / 2`. `mouse:up` also applies the release position
  before finishing, since the last `mouse:move` can lag it. Cloud (A7 — rectangle-based, wavy border, positioned right after the
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
- **Polygon (removed)**: the Polygon tool was dropped from the toolbar and the canvas. Server-side burn-in still
  draws `'polygon'` objects so any annotations saved earlier keep rendering.
  `cancelPendingGestures` now only wraps `exitActiveEditing`.
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
  untouched (matches the "Cancel during delete confirmation" edge case in §5). The modal uses
  `ConfirmModal.jsx`'s `card` variant with a "Delete" confirm label; title/body copy is unchanged.
- Cloud: rectangle-based, wavy border, positioned right after the shape tools (A7).
- Signature: positioned after Cloud, signature icon, image upload placed on the page at a default
  size the user can move/resize; validated (type + size) and re-encoded server-side, not stored/served
  as the raw upload (A8, R8).
- No annotation capability beyond A1–A8 for edit users — no notes tool, no cover pages, nothing
  unlisted (A9; see §6 Out of Scope).

- **Draft autosave (implemented; migration `20260930130000_attachment_drafts.sql` applied):** annotations
  are no longer lost on leaving the editor. `AnnotationCanvas` reports every add/modify/remove/typing
  change (`onChange`; suppressed while restoring/disposing); `useAnnotationDraft` debounces them
  (2s) into `PUT /api/attachments/:id/draft` (`{ pages }`, same per-page Fabric JSON as burn-in, stored
  in the new `attachment_drafts` table — one row per attachment, `on delete cascade`, service-role only,
  owner-only via `requirePermission(canRead/canWrite)`; 400 on a malformed/over-8 MB draft, last write
  wins). It's a separate table, not `attachments.annotations`, because `attachments` has an `updated_at`
  trigger and autosave would bump the file's "Last modified". On open, `GET …/draft` is restored into the
  canvases (`restoreDraft`; refuses to overwrite annotations already started). A `localStorage` copy
  (`inkspace:draft:<id>`) bridges the gap before a save lands (tab closed, offline): it holds only
  *unsynced* work, is removed once the server accepts a save, and on open the newer of (local, server)
  wins — so a stale local copy can't shadow edits made on another computer. Failed saves retry every
  15s and on `online`; the toolbar shows "Saving draft… / Draft saved / Couldn't save draft — retrying".
  Autosave snapshots never cancel text editing and skip still-empty text boxes (`getDraftPages`). **Back**
  flushes the draft and leaves directly; only if that save fails does it warn ("Go back?"). Save/Download
  are unchanged (still burn in to a new file/download); the draft is kept afterwards. **Recent grid:** `GET /api/attachments` also returns `draftUpdatedAt` (from `attachment_drafts`,
  time only, null when the draft is missing or emptied), and `RecentSection` ranks files by the later of
  `updatedAt` and `draftUpdatedAt` (`lastActivityTime`) and tags those with a draft "Draft" — so a file
  annotated a moment ago appears there even though its own `updatedAt` never moved. The file list's
  "Last modified" column is unchanged. Known limits: no UI
  to discard a draft yet; no cross-device conflict warning (last write wins); a draft is never applied to
  a PDF until the user saves/downloads.

- **Document editor (implemented):** the toolbar's Document-editor button opens `DocumentEditorModal.tsx`
  with a thumbnail of every page, the page the annotation view is on focused by default (same highlighted
  border as the viewer's thumbnails; click a page to focus it). Tools act on the focused page:
  **Upload PDF** (PDF only — type, `%PDF-` header and a pdf.js parse are all checked; encrypted/damaged files
  are refused with a per-file message; uploads total ≤ `MAX_UPLOAD_BYTES`) inserts the uploaded pages right
  *after* the focused page and focuses the first of them; **Rotate left/right** (90° steps, there is no mirror
  flip); **Delete page** asks "Delete page?" first (the last page can't be deleted). Pages are
  **drag-and-dropped** one at a time (native HTML5 drag; dropping on a page puts the dragged page at that
  position). The footer has **Cancel** then **Save**, right-aligned; Cancel (and Esc) closes at once —
  no confirmation even with unsaved changes; Save is enabled only when something changed. The edit is a
  list of pages `{ source, pageIndex, rotate }` (`documentEditModel.ts`); on Save the client calls
  `POST /api/attachments/:id/pages` (owner-only, `{ uploads: base64[], pages }`), which rebuilds the PDF
  with pdf-lib (`documentEdit.ts`), writes it to a **new** Storage object, repoints
  `attachments.storage_path`/`page_count`/`byte_size` (so "Last modified" moves) and removes the old object
  — **unlike burn-in, this replaces the file itself** (the original pages are not kept). Then
  `AnnotationCanvas.applyDocumentEdit` moves every page's annotations to where the page went (a deleted
  page's are dropped, a rotated page's turn with it — `pageRotation.ts`, verified against Fabric's own
  corner coordinates), the remapped draft is flushed to the server, and `usePdfDocument().reload()` swaps the
  new document in (the viewer comes back at page 1, 100%). To make rotated pages/annotations burn in
  correctly, burn-in now honours a page's `/Rotate` (objects are drawn inside a display→user `cm` matrix,
  cross-checked against pdf.js) and Fabric's per-object `angle` (drawn inside a rotation about the object's
  origin point) — closing the old "rotation isn't reproduced" gap. Known limits: keyboard-only page
  reordering isn't offered; the editor doesn't warn about two tabs editing the same file.

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
- New attachments are always owned by whoever saves them (`req.userId` from `requireAuth`), which under
  the single-owner model (§4) is always the original's owner too.

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
- **Object `type` is matched case-insensitively.** Fabric 7 serializes `type` as the class name (`Rect`,
  `Ellipse`, `Path`, `Textbox`, …), not lowercase. `drawAnnotationObject` lowercases it before its
  `switch`; before that fix every object fell into the skip-unknown `default` branch, so Save/Download
  produced an un-annotated copy of the PDF. Regression-tested in `tests/burn-in.test.ts` against real
  Fabric `toObject()` output. The PDF work lives in the storage-free, exported `burnInPdfBytes(bytes, pages)`
  (`applyBurnIn` = download bytes from Storage → `burnInPdfBytes` → base64); `storage.js` is imported lazily
  inside `applyBurnIn` so the core is testable without Supabase env vars.
- **Text styling:** the Text tool's font family (`Helvetica` / `Times New Roman` / `Courier New`) maps to
  the matching PDF standard font, with `fontWeight: bold` and `fontStyle: italic` selecting its Bold /
  Oblique / Bold-Oblique variant; `underline: true` draws a line under each wrapped line of text
  (thickness ≈ fontSize/15, just below the baseline). Its position hasn't been compared pixel-for-pixel
  against Fabric's own underline rendering.
- Takes the Fabric.js annotation JSON `AnnotationCanvas.jsx`'s `getAnnotationsForBurnIn()` produces (one
  entry per page that has at least one object, in that page's own PDF-point space — no client-side
  coordinate conversion, matching every other Risk R1 guarantee in this feature) and draws each object onto
  a copy of the original PDF's pages via `pdf-lib`.
- Coordinate math (`server/services/annotationGeometry.ts`, deliberately dependency-free — see the file's
  own comment — and unit-tested in `tests/annotationGeometry.test.ts` independent of whether `pdf-lib`
  happens to be installed) derives each object's current bounding box from `left`/`top`/`width`/`height`/
  `scaleX`/`scaleY`/`originX`/`originY` exactly as Fabric itself interprets them — **including** the
  documented Rectangle/Ellipse center-origin offset (§9) — so a burned annotation matches
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
- **Known gaps, tracked, not fixed here:** (rotation is no longer one: Fabric's `angle` and a page's
  `/Rotate` are now burned in — see the Document-editor note in §3.2.) Burned text uses PDF
  *standard* fonts (Helvetica/Times/Courier, see the text-styling note above), not the browser's actual
  font files, so glyph shapes approximate what Fabric renders on screen; only whole-textbox
  bold/italic/underline is supported (no per-character styles). `drawTextbox`'s per-line baseline (`box.y + fontSize + index *
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

**Login/signup UI restyle (commit `ca982f3`):** the auth pages (`LoginPage`, `SignupPage`,
`ForgotPasswordPage`, `ResetPasswordPage`) share a frosted-card layout. Behavior that changed or was added
beyond the original LG1/SU1 wording:
- **Inline validation tooltips replace the browser's native bubble.** Forms use `noValidate`; on submit,
  `FieldTooltip.tsx` renders the first failing field's message above that field (`role="alert"`, test ids
  `login-error` / `signup-error` / `forgot-password-error`) and the tooltip clears as soon as the user edits
  a field. `validateEmailField` returns "Email is required", "Please include an '@' in the email
  address.", or "Please enter a valid email address."; login additionally requires a non-empty password
  ("Password is required"). Server/Supabase errors (bad credentials, rate limit, signUp error) show in the
  same style above the submit button.
- **Signup password policy** (`src/lib/passwordPolicy.ts`, also enforced on reset-password and Settings
  change-password): 8-20 characters with an uppercase letter, a lowercase letter, a number, and a special
  (non-alphanumeric, non-whitespace) character; a failing password shows the full requirements list in one
  message. **Login does not apply this policy** so accounts created before it existed can still sign in.
- **Show/hide password:** `PasswordField.tsx` renders an eye toggle (visible only once the field has
  content) that flips the input between `password` and `text`.
- **Back to login:** the check-your-email cards and the forgot-password form use `BackToLoginButton.tsx`
  (links to `/login`).
- **Already-registered email:** with email confirmation on, Supabase returns a user with empty `identities`
  instead of an error; signup shows "An account with this email already exists. Please log in instead."
- Branded Supabase email templates live in `supabase/templates/` (see `supabase/README.md`); they must be
  pasted into the dashboard manually, so nothing tests them.
Test coverage: `tests/LoginPage.test.tsx`, `tests/SignupPage.test.tsx`, `tests/ForgotPasswordPage.test.tsx`,
`tests/passwordPolicy.test.ts`, `tests/fieldValidation.test.ts` (component level, mocked Supabase client).

**Workspace file view:** the workspace shows files only as the sortable list (`FileList.tsx`); the grid view, `FileGrid.tsx`, and the Grid/List toggle (WF8) were removed. Current behavior of the list and page:
- **Loading:** until the first `GET /api/attachments` settles, the page shows a five-dot loader (`workspace-loading`) instead of the empty state; the "Recent" heading appears in the toolbar row (next to Upload and search) only once files exist.
- **Upload:** the picker accepts multiple PDFs and keeps the first 5 (`MAX_FILES_PER_UPLOAD`). Each file is validated (filename rules, `MAX_UPLOAD_BYTES`) and uploaded independently; failures are listed one per line (`<name>: <reason>`) while the files that did upload still appear.
- **List:** sorted by Name or Date; clicking the active column header toggles ascending/descending (arrow indicator). Paginated client-side, 5 rows per page (`PAGE_SIZE`), with a footer showing "N files total" and Previous/Next with "Page X of Y" (the page is clamped after a delete or search narrows the list). Files with an autosaved draft carry a "Draft" tag.
- **Recent:** the 5 most recently active files (`RECENT_LIMIT`, `lastActivityTime` = later of `updatedAt` / `draftUpdatedAt`).
- **Per-file actions:** Download and Delete only; there is no Annotate/Edit button (the file name opens `/edit/:id`).
- **Settings:** the Account menu's Settings item opens `SettingsModal` over the workspace (no `/settings` route).

**Workspace folders removed from the UI:** the workspace has no folder sidebar, breadcrumbs, or folder
navigation (WF1–WF4, WF10 are withdrawn). `WorkspacePage.tsx` fetches every attachment with one
`GET /api/attachments` call and shows them in a single flat list, so files that already carry a `folderId`
still appear. Consequently: the `/workspace/folders/:folderId` route, `FolderTree.tsx`, `Breadcrumbs.tsx`,
the per-file "Move to folder" select (WF3), the folder-delete confirmation, and the "no folders" empty state
are gone, and Recent (WF7) and search (WF11) both operate on that one list. Still in place: Upload, Recent,
search, sort, per-file Open/Download/Delete (delete is still confirmation-gated), and the Account menu.
**Backend untouched:** `/api/folders`, `folders.ts`, the `folders` table/migration, and account-deletion
handling of folders remain; they are simply unreachable from the UI. Removing them is a separate decision.

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
`LoginPage.tsx`'s existing "Forgot your password?" link) calls `supabase.auth.resetPasswordForEmail(email, {
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
`RequireSession` in `App.jsx` — reaching them is exactly the unauthenticated case they exist for. **Settings
(revised):** Settings is no longer a routed page (`/settings` and `SettingsPage.tsx` are gone) — it is
`src/modals/SettingsModal.tsx`, opened from the workspace's Account menu over the workspace. Sections,
separated by dividers: **Email** (the session's email in a *disabled, read-only* field — changing email
is no longer supported, so there is no email-change/re-verification flow from Settings), **Password**
(titled "Change password"; `updateUser({ password })`, same policy as reset; the fields are the signup form's `PasswordField` — floating placeholder, in-field eye show/hide toggle, and `FieldTooltip` errors on the offending field: the requirements list on *New password*, "Passwords do not match" on *Confirm*, a server error above the submit button), and **Danger zone**
(delete account, via the card-style confirmation). A successful password change shows a transient success toast (`Toast.tsx`, "Password updated successfully", `settings-password-success`; auto-dismisses after 4s or on click) rather than inline text. The profile display-name field and its
`user_metadata.display_name` storage were removed; migration
`20260930120000_drop_profile_display_name.sql` clears the key from existing users' auth metadata
(it leaves `public.workspaces.display_name`, the workspace's own name, alone). **Found in code review:** the
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
- **A non-owner calls the API directly** (bypassing the UI) to burn-in, save, read or edit the draft, or edit pages — must get 403, not
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
blank-page insertion and keyboard-only page reordering (page upload/insert, reorder, rotate and delete *are* shipped, via the Document editor, §3.2) · locally persisted style preferences (stretch,
ST1) · cross-account sharing of any kind (cut entirely per §4).

## 7. Acceptance Criteria (Definition of Done)

Demonstrable on a real attachment, by someone other than the builder:

1. PDF opens with a loader; thumbnails visible by default; working scroll, zoom, pan, fit-width, and
   page navigation (current page, prev/next, type-to-jump). — **§3.1**
2. A user places at least one annotation from every tool category, using each tool's own style (color, width), and
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
| 2 — Annotation tools (A1–A9) | Done (2.1–2.14; 2.15's tests land alongside): (Polygon, 2.11, was later removed — §3.2.) Fabric.js installed (2.1); `AnnotationCanvas.jsx` layers a per-page Fabric canvas normalized to PDF-point space, coordinated with `PDFViewer.tsx`'s destructive re-renders (2.2). Pen/Freeform Highlighter (2.4/2.6), Text (2.5), Text Highlighter (2.7), Rectangle/Ellipse (2.8), Line/Arrow (2.8), Cloud (2.9), the per-tool style popover (`StyleControls.tsx` + `ColorPicker.tsx`, 2.10; revised: per-tool color/width, optional fill on closed shapes), Signature (2.12), select/move/resize (2.13, A5), and the delete-confirmation modal (2.14, A6) are implemented. Signature (`SignatureUploader.tsx`): validates type/size client-side, re-encodes the upload through an offscreen `<canvas>` before placing it (A8/R8's client-side half — the *authoritative* server-side re-check/re-encode is task 5.3/5.6, done: see §10), and places it via `AnnotationCanvas.jsx`'s `addSignatureImage` at a default width (clamped to the page's own width) on whichever page is currently on screen. Select/move/resize (2.13): see §3.2's A5 note for the Pen/Freeform Highlighter fix this required. Delete (2.14): see §3.2's A6 note. |
| 3 — Download & Save (D1–D3, S1–S8, F1–F6) | Implemented (3.1–3.11): burn-in (`server/services/burn-in.ts` + `annotationGeometry.ts`), save-as-new-attachment (`server/services/storage.ts`'s `saveAttachment`/`downloadAttachmentBytes`), `src/utils/filenameUtils.ts` (F1–F6, shared client/server), `SaveModal.tsx`, and the Download/Save toolbar wiring in `ViewerPage.jsx`/`Toolbar.jsx`. **`pdf-lib` is installed** (`package.json` `^1.17.1`) and burn-in is exercised by `tests/burn-in.test.ts` (real Fabric-serialized objects → real PDF bytes, including bold/italic/underline text). `npm run typecheck` is clean. A real Download/Save against a real attachment in a browser has not been re-verified here. The coordinate math those two files depend on (`annotationGeometry.ts`) has no such dependency and *is* unit-tested (`tests/annotationGeometry.test.ts`). |
| 4 — Permissions (single-owner) | **Superseded, see §4.** The original email-based sharing implementation (P1–P5, `shares` table, `ShareModal.tsx`, edit/view roles) was fully built and tested in an earlier session, then cut entirely in `tasks/tasks-accounts-workspace.md` task 7.0 per that PRD's §3.4/WF5 revision. Current state: `server/middleware/permissions.ts`'s `canRead`/`canWrite`/`canBurnIn`/`isOwner` are all owner-only; every attachment/burn-in route is gated by `requirePermission` against real `requireAuth` identity (`req.userId`, a verified Supabase JWT — not the old `x-user-id` stub); `NoAccessState.tsx` still covers the no-permission/dead-link empty state via `usePdfDocument.ts`'s `accessDenied`. `supabase/migrations/20260929150000_drop_shares.sql` dropped the `shares` table and `share_role` enum (`npm run supabase:migrate` succeeded: `"message":"Finished supabase db push."`); `src/lib/database.types.ts` was regenerated and no longer mentions either. `tests/permissions.test.ts`/`tests/permissions.api.test.ts` keep owner-vs-stranger real-HTTP/unit coverage; the attachments/burn-in half of `permissions.api.test.ts` self-skips without the Supabase credentials it needs (`HAS_CREDS`) — unrelated to the sharing cut. |
| Post-plan additions | Shipped outside `tasks/tasks-pdf-editor.md`, all documented in §3.2/§4: editor wheel/pinch zoom, text-selection markup (Strikethrough/Highlight/Underline), Text bold/italic/underline + font/size, draft autosave (`attachment_drafts`, migration `20260930130000`), Document editor (page upload/rotate/delete/reorder, `POST /api/attachments/:id/pages`), burn-in of page `/Rotate` and object `angle`, workspace redesign (Settings modal, multi-upload, pagination, Recent/Draft tags, toasts), removal of `/view/:id` and the profile display name (migration `20260930120000`). |
| 5 — Hardening | Done (5.1–5.7, see §10). All items closed. (The `pdf-lib`-install blocker this row once carried is resolved — see §9.) |

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
  `@playwright/test` install blocker; `tests/SettingsModal.test.tsx` covers the settings modal at the component
  level, and `tests/account.test.ts`/`tests/account.api.test.ts` cover the cascade and the
  own-account-only route boundary at the HTTP/service level instead.
- **`npm run supabase:migrate` (task 4.2) wasn't run that session** — blocked by the environment's
  auto-mode classifier as a production-deploy action; the schema was already live, so this was a process
  gap, not drift. The later migrations (`20260930120000_drop_profile_display_name.sql`,
  `20260930130000_attachment_drafts.sql`) must likewise be applied wherever the app is deployed — the draft
  endpoints and `GET /api/attachments` (which reads `attachment_drafts`) fail without the latter.
- **Resolved: `pdf-lib` is installed.** It was missing when burn-in/storage were first written (sandbox
  registry access failed), which also made `server/index.js` crash on startup via its static imports of
  `attachments.js`/`burn-in.js`. `pdf-lib` is now a dependency and burn-in runs under test
  (`tests/burn-in.test.ts`). Still open: a real Download/Save against a real attachment at multiple zoom
  levels (see the coordinate-drift item below). The `TS2379` typecheck errors in `burn-in.ts` are gone (`npm run typecheck` is clean).
- **No server-side pagination on `GET /api/attachments`/`GET /api/folders` (task 4.0)** (the workspace list now paginates client-side, 5 rows per page — §4 — but still fetches every row in one query) — `listAttachments`/`listFolders` return every row in one query, and
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
- **Resolved: Rectangle/Ellipse render offset from the dragged box** — both tools now set `originX/originY: 'left'/'top'` (§3.2), so the shape lands on the dragged box. Original finding, kept for history (found while implementing
  2.12, pre-existing since 2.7/2.8, not fixed here — out of scope for 2.12's diff): Fabric's object
  default is `originX`/`originY: 'center'` in the installed version (`fabric@7.4.0`), so `left`/`top`
  mean an object's *center*, not its top-left corner, unless overridden. `BOUNDS_SHAPE_TOOLS`'s
  `rectangle`/`ellipse` entries in `AnnotationCanvas.jsx` set `left`/`top` to the
  drag box's top-left corner on every resize without overriding origin, so the rendered shape is
  actually centered on that point — offset up-and-left from the real drag box by half its own
  width/height (confirmed via `getBoundingRect()`; e.g. a 100×60pt drag from (10,10) renders at
  bbox (-40.5, -20.5), not (10, 10)). Existing tests don't catch this because they only assert the raw
  `left`/`top`/`width`/`height` properties equal the computed drag box, not the object's actual
  rendered bounding box. Cloud/Line/Arrow/Polygon are unaffected (Path/Polygon shapes derive `left`/
  `top` from their own absolute point data, so nothing external imposes a mismatched interpretation).
  `addSignatureImage` (2.12) sets `originX: 'left', originY: 'top'` explicitly to avoid this.
- **Resolved by 5.2 (§10): every zoom/pan/fit-width change fully re-renders the document from page 1** (`PDFViewer.tsx`'s
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
  set/order (Hand + 11 tools; the style control is a single popover for the active tool, not a per-annotation one).
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
  files pull in `pdf-lib` transitively) asserting every non-GET route
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
- **5.7 (current status, re-run 2026-10-01):** `npm test` — 373 pass, 0 fail, 0 skipped. `npm run typecheck` — clean. (The earlier "171 pass / 2 skipped / 3 `pdf-lib` errors" figures predated `pdf-lib` being installed.)
