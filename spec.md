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
- One **global** style — color (default red), fill (default transparent), stroke width (default 4pt);
  changing it affects the active tool going forward, not existing annotations unless re-selected (A4).
  Not yet a real control (`StyleControls`/`Toolbar`'s style row is task 2.10) — until then, every tool
  that draws uses fixed constants in `AnnotationCanvas.jsx` (`#dc2626` red, 4, matching A4's defaults).
- **Pen and Freeform Highlighter (A2, A3, implemented)**: `activeTool` is lifted from `Toolbar.jsx` up to
  `ViewerPage.jsx` (owns the state) and passed to both `Toolbar.jsx` (controlled) and
  `AnnotationCanvas.jsx`. `AnnotationCanvas.jsx`'s `TOOL_BRUSH_STYLES` map (keys = free-drawing tool ids,
  values = `{ opacity }`) is both the free-drawing membership test (`FREE_DRAWING_TOOLS` is derived from
  its keys) and the per-tool style lookup — extending it is how any future free-drawing tool gets added
  (through 2.13, no other tool in the task list is `PencilBrush`-based; 2.7's Text Highlighter is a
  drag-rectangle, not freehand, so it needs a parallel mechanism, not this one). Pen and Freeform
  Highlighter share the same base color/width (`BASE_STROKE_COLOR`/`BASE_STROKE_WIDTH`) but differ in
  `opacity` (1 vs. 0.35). Opacity is baked into the *live* brush color (`withAlpha`) so the in-progress
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
  a `PencilBrush` at the shared base color/width, and Fabric's `upperCanvasEl` gets `pointer-events: auto`
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
  on top). The new box gets the base color as its fill, drops the user straight into editing
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
  Highlighter is a filled, semi-transparent shape with no stroke — `fill: BASE_STROKE_COLOR`, a real
  `opacity: HIGHLIGHTER_OPACITY` property (not baked into the fill color, so it stays a real property in
  the serialized state for burn-in later) — sharing the same opacity constant Freeform Highlighter uses
  (extracted so the two tools' visual treatment can't drift apart by accident). Rectangle, Ellipse, and
  Cloud are the reverse — `fill: null` (A4's "fill default transparent" — an outline only, letting the
  page show through), `stroke: BASE_STROKE_COLOR`/`strokeWidth: BASE_STROKE_WIDTH`, no dash array (A2:
  outlines render solid). Ellipse's own `.width`/`.height` are derived from `rx`/`ry` (confirmed
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
  a filled triangle, sized proportional to `BASE_STROKE_WIDTH`, but clamped to at most half the arrow's
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
- Any placed annotation: select → move, resize, or delete (A5). Delete requires a confirmation modal,
  title exactly `"Delete annotation?"`, body exactly `"Are you sure you want to delete this
  annotation?"` (A6).
- Cloud: rectangle-based, wavy border, positioned right after the shape tools (A7).
- Signature: positioned after Polygon, signature icon, image upload placed on the page at a default
  size the user can move/resize; validated (type + size) and re-encoded server-side, not stored/served
  as the raw upload (A8, R8).
- No annotation capability beyond A1–A8 for edit users — no notes tool, no cover pages, nothing
  unlisted (A9; see §6 Out of Scope).

### 3.3 Download (D1–D3)
- "Download" available from the viewer (D1); output includes all annotations burned in (D2); filename
  is unchanged from the original attachment (D3).

### 3.4 Save as new attachment (S1–S8, F1–F6)
- "Save" opens a "Save attachment" modal (S1), filename field pre-populated per the filename rules
  below (S2).
- On confirm: annotations burn into the PDF (server-side) before persisting as a **new** attachment row
  — the original is never mutated (S3).
- Progress shown while in flight (S4); filename field, Cancel, and the "X" close control are all
  visibly disabled during save (S5).
- Failure toast, exact text: `"Couldn't save <Attachment name>."` (S6). Success toast, exact text:
  `"<attachment name> saved successfully to workspace."` (S7). Either way, **the modal stays open** —
  it is never auto-dismissed (S8).

**Filename rules:**
- Default = `<existing filename> <UTC timestamp>` (F1); timestamp format `<day><month><year><hour><minute>`, UTC always, regardless of viewer timezone (F2).
- If the filename already ends in a timestamp in this format, the new one **replaces** it rather than
  appending a second one (F3).
- Validation, checked client-side (instant feedback) and re-checked server-side (authoritative):
  - Empty → `"Required field"` (F4)
  - `> 255` chars → `"255 characters maximum"` (F5)
  - Disallowed characters (path separators / OS-reserved characters — exact set to be enumerated
    during implementation) → `"Invalid characters"` (F6)

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

**Current implementation gap:** `server/middleware/permissions.ts` implements the read/write/burn-in
checks (`canRead`, `canWrite`, `canBurnIn`) against the `shares` table correctly, but every route still
identifies the caller from a client-supplied `x-user-id` header (`requirePermission` in
`server/middleware/permissions.ts:68`), not a verified Supabase JWT. Until real auth lands (tracked as
task 1.6 / 4.3 in `tasks/tasks-accounts-workspace.md`), P1–P5 are enforceable in test/dev but **not
safe against a malicious client**, which can simply send someone else's user id. Treat this as the bar
to build to, not the current guarantee — flag it in any security review until closed.

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
   no Save, a notes button instead); no-access or dead link gets the empty state. — **§4**
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
| 2 — Annotation tools (A1–A9) | Partial: Fabric.js installed (2.1); `AnnotationCanvas.jsx` layers a per-page Fabric canvas normalized to PDF-point space, coordinated with `PDFViewer.tsx`'s destructive re-renders (2.2). No tools yet — `Toolbar.jsx` is still a structural stub, and the overlay's `pointer-events: none` until a tool is active. |
| 3 — Download & Save (D1–D3, S1–S8, F1–F6) | Not started. `pdf-lib` not installed; `applyBurnIn`/`saveAttachment` are placeholder stubs (`server/services/burn-in.js`, `server/services/storage.ts`) tied to an old timestamp/watermark concept, not the annotation model above. |
| 4 — Permissions & sharing (P1–P5) | Partial: `shares` table and `canRead`/`canWrite`/`canBurnIn` logic exist and are unit-tested (`tests/permissions.test.ts`). Identity is still the `x-user-id` header stub (see §4 gap). `ShareModal`, `NoAccessState`, and the grant endpoint are not built. |
| 5 — Hardening | Not started (depends on 2–4). |

## 9. Known Gaps to Track Until Closed

- **Auth is a stub, not a security boundary yet** — see §4. Do not treat P1–P5 as satisfied until
  `requirePermission` reads identity from a verified Supabase JWT instead of `x-user-id`.
- **Burn-in and save services are placeholders** tied to an unrelated timestamp/watermark concept —
  they need to be rebuilt against the actual annotation JSON model, not extended in place.
- **No coordinate-drift check exists yet** (Risk R1) — needed before Phase 2/3 can be called done.
- **Every zoom/pan/fit-width change fully re-renders the document from page 1** (`PDFViewer.tsx`'s
  `[pdfDoc, scale]` effect clears and rebuilds every page, not just the ones near the viewport) — on
  the `large-multipage.pdf` fixture this means a single zoom click blanks the whole viewport and
  re-decodes every page before the user's position reappears. Known, accepted for now: task 5.2
  ("virtualized/progressive page rendering... so large documents don't block on full-document load")
  is the tracked fix for this, against Risk R2. Don't treat 5.2 as done without re-checking this.
  Since 2.2, this also disposes and rebuilds *every* page's Fabric annotation canvas
  (`toJSON`/`loadFromJSON` round-trip) on the same schedule — 5.2 needs to cover both costs, not just
  pdf.js's own re-decode.
