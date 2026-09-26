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
- **Pen (A2, A3, implemented)**: `activeTool` is lifted from `Toolbar.jsx` up to `ViewerPage.jsx` (owns
  the state) and passed to both `Toolbar.jsx` (controlled) and `AnnotationCanvas.jsx`. When `activeTool`
  is a free-drawing tool (currently just `pen`; `AnnotationCanvas.jsx`'s `FREE_DRAWING_TOOLS` set grows
  as 2.5+ lands), every tracked page canvas gets `isDrawingMode = true` with a `PencilBrush` at the A4
  defaults, and Fabric's `upperCanvasEl` gets `pointer-events: auto` (otherwise `none`, so the overlay
  doesn't intercept clicks meant for pan/zoom-controls when no drawing tool is active). A `pointerdown`
  listener on that same element stops propagation while `isDrawingMode` is true, so a drag draws instead
  of also triggering `PDFViewer.tsx`'s pan gesture on the ancestor `.pdf-viewer`.
  **Implementation note (not itself a requirement, but load-bearing):** Fabric wraps whatever `<canvas>`
  element it's given in its own `.canvas-container` div (`position: relative` by default, holding a
  "lower" and "upper" canvas). Without `.canvas-container { position: absolute; }` in `global.css`, that
  wrapper sits in normal flow *after* the PDF canvas inside `.pdf-viewer-page` instead of overlaying it —
  found and fixed while implementing 2.4, but it was latent since 2.2 (nothing before 2.4 ever made the
  overlay visibly interactive enough to notice).
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
