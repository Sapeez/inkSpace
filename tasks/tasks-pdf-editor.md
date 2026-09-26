## Relevant Files

- `src/viewer/ViewerPage.jsx` - Existing route-level container (pre-existing JSX stub, left as-is per `agents/rules/typescript-standard.md` §2.3/§5); composes `Toolbar`, `PDFViewer`, `ThumbnailPanel`, and `AnnotationCanvas`.
- `src/viewer/usePdfDocument.ts` - Shared hook: fetches the signed URL and loads the pdf.js document once per attachment; `ViewerPage` owns it and passes `pdfDoc`/`loading`/`error` down to `PDFViewer` and `ThumbnailPanel` so the PDF is only fetched/parsed once.
- `src/viewer/PDFViewer.tsx` - Main PDF viewer component (rendering, scroll, zoom, pan, fit-width). Takes `pdfDoc`/`loading`/`error` as props, plus `onPageRendered`/`onPagesReset` callbacks so `AnnotationCanvas.jsx` knows exactly when a page's DOM is (re)created or about to be torn down.
- `src/viewer/ThumbnailPanel.tsx` - Thumbnails sidebar, open by default, showing all pages. Takes `pdfDoc` as a prop; clicking a thumbnail scrolls the main view via the `pdf-page-<n>` id `PDFViewer` assigns to each page.
- `src/viewer/PageNavigator.tsx` - Page navigation controls (prev/next buttons, type-to-jump input).
- `src/styles/global.css` - Existing single global stylesheet (no per-component CSS files in this repo); gains the viewer/annotation/toolbar layout rules as each component lands.
- `src/viewer/NoAccessState.tsx` - Empty state for no-permission or dead-link scenarios.
- `src/annotation-canvas/AnnotationCanvas.jsx` - Existing pre-existing JSX stub; gains a `forwardRef` imperative handle (`handlePageRendered`/`handlePagesReset`/`getCanvas`, wired from `PDFViewer.tsx` via `ViewerPage.jsx`) that layers one Fabric.js canvas per PDF page, normalized to PDF-point coordinates, surviving PDFViewer's destructive re-renders on zoom/pan/fit-width/document change. Takes `activeTool` as a prop (task 2.4) and puts the relevant page canvas(es) into free-drawing mode with the default red/4pt/solid brush (A2–A4) when it's a free-drawing tool; toggles `pointer-events` on Fabric's `upperCanvasEl` accordingly, and stops pointerdown propagation while drawing so it doesn't also trigger `PDFViewer.tsx`'s pan gesture.
- `src/annotation-canvas/SignatureUploader.tsx` - Signature image upload and placement tool.
- `src/toolbar/Toolbar.jsx` - Existing pre-existing JSX stub; gains the annotation toolbar with all 11 tools in the required left-to-right order. Controlled component as of task 2.4 — `activeTool`/`onToolChange` are owned by `ViewerPage.jsx` (lifted up from local state) and passed to both `Toolbar.jsx` and `AnnotationCanvas.jsx`.
- `src/toolbar/toolbarIcons.tsx` - New file (TS, per typescript-standard §2.1); one small inline-SVG icon component per tool, no icon-library dependency.
- `src/toolbar/StyleControls.tsx` - Global color, fill, and stroke-width controls.
- `src/modals/ConfirmModal.jsx` - Existing generic confirm modal; reused (not replaced) for the delete-annotation confirmation, passing the exact required title/body copy (requirement A6) — no separate `DeleteConfirmModal` component needed.
- `src/modals/SaveModal.tsx` - Save-as-new-attachment modal with filename field, validation, progress state, and toast feedback.
- `src/modals/ShareModal.tsx` - Email-based share/permission UI for owners.
- `src/utils/filenameUtils.ts` - Timestamp generation, existing-timestamp detection/replacement, and filename validation logic (F1–F6).
- `server/routes/attachments.js` - Existing pre-existing JS file; gains fetch-attachment wiring against real permission checks.
- `server/routes/burn-in.js` - Existing pre-existing JS file; gains the real burn-in request/response wiring against `pdf-lib`.
- `server/services/burn-in.ts` - Burn-in service, converted to TS while its real pdf-lib logic is implemented (draws annotations onto the original PDF's pages, requirement S3/R4).
- `server/routes/shares.ts` - Backend endpoints: grant access by email, look up permission for a user, revoke access.
- `server/middleware/permissions.ts` - Converted from the current all-permissive `.js` stub to TS while its real logic (edit vs. view-only per attachment) is implemented — priority conversion per `agents/rules/typescript-standard.md` §5.
- `supabase/migrations/XXXXXXXXXXXXXX_pdf_editor.sql` - Any schema additions still needed on top of the existing `shares` table (see Notes below).
- `tests/filenameUtils.test.ts` - Unit tests for all filename/timestamp rules (F1–F6), including boundary cases.
- `tests/PDFViewer.test.tsx` - Tests for `PDFViewer`'s own rendering/loading/error states.
- `tests/PageNavigator.test.tsx` - Tests for prev/next navigation and the type-to-jump page input (split out of `PDFViewer.test.tsx` since navigation lives in its own component, `PageNavigator.tsx`, per task 1.5).
- `tests/setup/jsdom.ts` - Per-file jsdom setup (`global-jsdom`) for component tests; deliberately *not* wired in process-wide via a `--import` flag, since that also applies to non-DOM test files run in their own child process (e.g. `permissions.test.ts`, which makes real network calls jsdom's globals broke).
- `tests/AnnotationCanvas.test.tsx` - Tests for `AnnotationCanvas.jsx`'s Fabric canvas lifecycle: on-screen scale sizing, coordinate persistence across a rescale, and the stale-`handlePageRendered`-call race (added ahead of 2.15 per code review, since this logic landed in 2.2).
- `tests/Annotator.test.ts` - Tests for toolbar rendering, style controls, delete confirmation, and annotation CRUD.
- `tests/SaveModal.test.ts` - Tests for modal states, validation feedback, and toast messages.
- `tests/permissions.test.ts` - Unit tests for the server-side permission middleware.
- `tests/permissions.api.test.ts` - Integration tests that call the API directly as a low-privilege user to confirm server-side enforcement.

### Notes

- `../spec.md` is the living spec for this feature. After finishing each sub-task below, update it if the implementation changed or clarified agreed behavior (e.g. moved a requirement from "planned" to "current", or the real behavior diverged from the PRD in a way worth recording) — do this as part of finishing the sub-task, not deferred.
- Unit tests should be placed in the `tests/` directory (the project convention), named after the file they test.
- Use `npm test` to run the test suite (`node --test` — do not add Jest, Vitest, or Mocha). New `.ts` test files run per `agents/rules/typescript-standard.md` §3.1.
- Install pdf.js and Fabric.js (or Konva.js) as client dependencies; install pdf-lib as a server dependency.
- All permission checks must exist server-side; hiding a UI element is a UX nicety, not a security control.
- Burn-in runs server-side via pdf-lib — do not do a purely client-side burn-in.
- All timestamps (F1–F3) are computed in UTC.
- The `shares` table (`grantee_email`, `grantee_user_id`, `role: edit|view`, `granted_by`, `granted_at`) already exists as of `supabase/migrations/20250825000000_reconcile_shares.sql`, which superseded the differently-shaped `permissions` table from the original migration — task 4.1 only needs to add the endpoint/middleware logic against it, not recreate the table. See `agents/skills/database.md` for the confirmed schema.
- New files in `src/` and `server/` are TypeScript from creation, per `agents/rules/typescript-standard.md` §2.1. The three pre-existing stubs (`ViewerPage.jsx`, `Toolbar.jsx`, `AnnotationCanvas.jsx`) stay `.jsx` for now — they're existing files, not new ones, and the canvas/PDF rendering directories are explicitly excluded from opportunistic conversion (§2.3, §5). `permissions.js` → `.ts` is the exception: its real logic is being written from scratch in this task list, and it's the named priority conversion target.

## Instructions for Completing Tasks

**IMPORTANT:** Check off each task as you complete it by changing `- [ ]` to `- [x]`. Update after each sub-task, not only after finishing a parent task.

After implementing each sub-task, before checking it off, run this full loop — not just the code change:

1. Update `../spec.md` if the implementation changed or clarified agreed behavior.
2. Add meaningful tests for what the sub-task actually built: unit tests per `agents/skills/testing.md` (`node --test`, in `tests/`), and, for any UI-facing or permission-facing behavior, integration tests per `agents/skills/integration-testing.md` / `agents/rules/integration-tests.md` (Playwright, in `tests/integration/<feature-area>/`). Run `npm test` and report the actual pass/fail output — not a description of expected output (`verification-loop` skill).
3. Run the `code-reviewer` skill/subagent against the sub-task's diff and report its findings verbatim, including anything still unresolved — do not summarize away open findings.
4. Only then flip `- [ ]` to `- [x]`.

## Tasks

- [x] 1.0 PDF Viewer — render, scroll, thumbnails, zoom/pan, page navigation
  - [x] 1.1 Install `pdfjs-dist` (the npm package for pdf.js) as a client dependency.
  - [x] 1.2 Create `PDFViewer.tsx`: load a PDF from a signed URL, render pages to a `<canvas>` element using pdf.js, and show a visible loading indicator while the file is being fetched and rendered (requirement V2).
  - [x] 1.3 Implement continuous scroll: render pages one below the other in a scrollable container so the user can scroll through the whole document (requirement V1).
  - [x] 1.4 Create `ThumbnailPanel.tsx`: render small thumbnail previews of every page in a sidebar that is open by default; clicking a thumbnail scrolls the main view to that page (requirement V3).
  - [x] 1.5 Create `PageNavigator.jsx`: display the current page number, add previous/next buttons, and add a text input where the user can type a page number and press Enter to jump directly to it (requirement V4).
  - [x] 1.6 Add zoom in / zoom out controls that re-render pages at the new scale (requirement V5).
  - [x] 1.7 Add pan support so the user can drag the view when zoomed in (requirement V6).
  - [x] 1.8 Add a "Fit width" button that sets the zoom level so the page fills the viewer's width (requirement V7).
  - [x] 1.9 Confirm that print, search, and any other pdf.js default controls are hidden or disabled — these are explicitly out of scope (requirement V8).
  - [x] 1.10 Write `tests/PDFViewer.test.js`: test that the loading state appears, that navigation buttons work, and that the page-number input jumps to the correct page. (Implemented as `tests/PDFViewer.test.tsx` for the loading/error states and `tests/PageNavigator.test.tsx` for prev/next + page-jump, since navigation is `PageNavigator.tsx`, not `PDFViewer.tsx` — see Relevant Files.)

- [ ] 2.0 Annotation Tools — full toolbar, global styling, select/move/resize/delete
  - [x] 2.1 Install `fabric` (Fabric.js) as a client dependency (or Konva.js — pick one and use it throughout). Chose Fabric.js — see spec.md §2 for rationale.
  - [x] 2.2 Create `AnnotationCanvas.jsx`: layer a Fabric.js canvas on top of each rendered PDF page, keeping its own coordinate system normalized to PDF point space so annotations don't drift when the user zooms or scrolls (requirement A1, see Risk R1).
  - [x] 2.3 Create `Toolbar.jsx` with tools in this exact left-to-right order: Pen, Freeform Highlighter, Text, Text Highlighter, Ellipse (default shape), Rectangle, Line, Arrow, Cloud, Polygon, Signature (requirement A1). Show sensible default icons for each.
  - [x] 2.4 Implement the Pen tool: freehand drawing that produces a solid stroke (requirement A2, A3).
  - [x] 2.5 Implement the Freeform Highlighter tool: same as pen but renders as a semi-transparent colored stroke.
  - [x] 2.6 Implement the Text tool: click to place a text box the user can type into.
  - [x] 2.7 Implement the Text Highlighter tool: drag a rectangle that highlights the area beneath it.
  - [x] 2.8 Implement Ellipse, Rectangle, Line, and Arrow shape tools; Arrow should be one-sided (arrowhead on one end only); all outlines render as solid (requirement A2).
  - [x] 2.9 Implement the Cloud tool: a rectangle-based shape with a wavy/cloud border, positioned after the shape tools in the toolbar (requirement A7).
  - [x] 2.10 Create `StyleControls.jsx`: three controls — color picker (default red), fill toggle/picker (default transparent), and stroke-width input (default 4pt). These settings are global (one set for all tools), and changing them affects future annotations only — not existing ones unless re-selected (requirement A4).
  - [ ] 2.11 Implement the Polygon tool: the user clicks to place vertices and closes the shape by clicking the first point.
  - [ ] 2.12 Create `SignatureUploader.jsx`: a button that opens a file-picker restricted to image files; on upload, validate type and size (client-side), re-encode the image, then place it on the canvas at a default size the user can move and resize (requirements A8, R8).
  - [ ] 2.13 Implement selection: clicking any placed annotation selects it and shows resize handles; the selected annotation can be dragged to a new position or resized by dragging a handle (requirement A5).
  - [ ] 2.14 Create `DeleteConfirmModal.jsx`: triggered when the user presses Delete (or a delete button) on a selected annotation; modal title must be exactly "Delete annotation?" and body text "Are you sure you want to delete this annotation?" with Confirm and Cancel actions (requirement A6).
  - [ ] 2.15 Write `tests/Annotator.test.js`: test that each tool can be activated, that the style controls update future annotations only, that the delete modal appears with the correct text, and that cancelling the modal does not remove the annotation.

- [ ] 3.0 Download & Save as New Attachment — burn-in, filename rules, feedback states
  - [ ] 3.1 Install `pdf-lib` as a server dependency.
  - [ ] 3.2 Add a server endpoint `POST /api/attachments/:id/burn-in` that accepts the annotation data, uses pdf-lib to draw each annotation onto the original PDF's pages server-side, and returns the resulting PDF buffer (requirement S3, R4).
  - [ ] 3.3 Add a server endpoint `POST /api/attachments` (or reuse the existing create endpoint) that accepts the burned-in PDF buffer and a filename, saves the file to Supabase Storage, creates a new attachment row in the database (never overwrites the original), and returns the new attachment's metadata (requirements S3, S7).
  - [ ] 3.4 Create `src/utils/filenameUtils.js` with three exported functions: `generateDefaultFilename(existingName)` — appends a UTC timestamp in `<day><month><year><hour><minute>` format, or replaces an existing timestamp if the name already ends in one (requirements F1–F3); `validateFilename(name)` — returns an error string for empty, >255 chars, or invalid characters, otherwise null (requirements F4–F6).
  - [ ] 3.5 Wire up the Download button in the viewer: call the burn-in endpoint with the current annotation data, receive the PDF, and trigger a browser download using the original attachment filename (requirements D1–D3).
  - [ ] 3.6 Create `SaveModal.jsx`: opens when the user clicks Save; pre-fills the filename field using `generateDefaultFilename`; validates the field using `validateFilename` on change and on submit; shows inline error messages for each validation failure (requirements S1–S2, F4–F6).
  - [ ] 3.7 On confirm in `SaveModal`: call the burn-in endpoint, then the save endpoint; while both are in flight, disable the filename field, Cancel button, and the X close control (visibly, not just functionally — requirement S5); show a progress indicator (requirement S4).
  - [ ] 3.8 On save failure: display a toast with the exact text "Couldn't save <Attachment name>." (requirement S6). Leave the modal open (requirement S8).
  - [ ] 3.9 On save success: display a toast with the exact text "<attachment name> saved successfully to workspace." (requirement S7). Leave the modal open (requirement S8).
  - [ ] 3.10 Write `tests/filenameUtils.test.js`: cover boundary cases — empty string, exactly 255 chars, 256 chars, a name that already ends in a timestamp (confirm replacement, not append), invalid characters, and a valid name with no timestamp.
  - [ ] 3.11 Write `tests/SaveModal.test.js`: test all three validation errors, the disabled state during save, and both toast messages.

- [ ] 4.0 Permissions & Sharing — email-based grants, edit/view split, empty states
  - [ ] 4.1 ~~Write the Supabase migration `supabase/migrations/XXXXXXXXXXXXXX_pdf_editor.sql`: add a `shares` table~~ — **done**, see `supabase/migrations/20250825000000_reconcile_shares.sql` (columns: `attachment_id`, `grantee_email`, `grantee_user_id`, `role: edit|view`, `granted_by`, `granted_at`). Confirm any missing columns on the existing `attachments` table are added separately if needed (requirements P1–P5).
  - [ ] 4.2 Run the migration with `npm run supabase:migrate` and confirm it applies cleanly.
  - [ ] 4.3 Create `server/middleware/permissions.js`: a middleware function that reads the current user's identity (from the auth token), looks up their role for the requested attachment, and sets `req.attachmentRole` to `edit`, `view`, or `none`; attach this middleware to all attachment-related routes.
  - [ ] 4.4 Add a server endpoint `POST /api/attachments/:id/shares` (owner only): accepts an email address and a role (`edit` | `view`), creates a share row, and resolves the email to an existing user ID if the email matches an existing user (requirement P1).
  - [ ] 4.5 Update the burn-in and save endpoints (from Task 3) to reject requests where `req.attachmentRole !== 'edit'` — return 403 (requirement P2, R4).
  - [ ] 4.6 Create `ShareModal.jsx`: a modal the attachment owner can open; lets them type an email address, choose edit or view access, and submit; displays the current list of shares and allows revoking them (requirement P1).
  - [ ] 4.7 In the viewer, check the current user's role before rendering: if `view`, hide all annotation tools and the Save button, and show the "notes" annotation control instead (a simple text-note control distinct from the editor's annotation tools) (requirements P3–P4).
  - [ ] 4.8 Create `NoAccessState.jsx`: shown when the user opens an attachment they have no permission to view, or the attachment doesn't exist; display a clear, non-broken message explaining the access issue (not a blank screen or generic error) (requirement P5).
  - [ ] 4.9 Wire `NoAccessState` into the viewer route: if the API returns 403 or 404 for an attachment, render `NoAccessState` instead of the viewer.
  - [ ] 4.10 Write `tests/permissions.test.js`: unit-test the `permissions.js` middleware with a mock request for each of the three roles (edit, view, none).
  - [ ] 4.11 Write `tests/permissions.api.test.js`: integration tests that call the burn-in and save endpoints directly (not via the UI) using a view-only auth token and confirm a 403 is returned — this verifies server-side enforcement independent of what the UI shows (Risk R4).

- [ ] 5.0 Hardening Pass — out-of-scope enforcement, performance, security review
  - [ ] 5.1 Go through the out-of-scope list (PRD section 3.4) and confirm none of the following exist in the shipped UI or API: print, search, per-annotation styling, a notes/comment tool for editors, cover pages, stamps, callouts, redaction, non-PDF attachment support, direct PDF content editing, OCR, form-filling, real-time co-editing, cross-session undo, page reorder/rotate (requirement DoD #6).
  - [ ] 5.2 Add virtualized/progressive page rendering: only render the pages currently visible in the viewport (plus a small buffer); render remaining pages lazily as the user scrolls, so large documents don't block on full-document load (Risk R2).
  - [ ] 5.3 Enforce a file-size limit on PDF upload and on signature image upload — validate and reject oversized files both client-side (instant feedback) and server-side (authoritative); surface the limit clearly to the user rather than silently failing (Risk R2, R8).
  - [ ] 5.4 Add a visual-diff smoke check: render the same annotation (e.g., a red rectangle) at fit-width, 100%, and 200% zoom, then compare its position in the burned PDF to its on-screen position to confirm there is no coordinate drift (Risk R1, Success Metric "Burn-in fidelity").
  - [ ] 5.5 Review all server endpoints for missing or bypassable permission checks — confirm every route that mutates an attachment or share is gated by the `permissions.js` middleware and returns 403 (not 200 or 404) for unauthorized callers.
  - [ ] 5.6 Confirm signature image uploads are re-encoded server-side (not stored and served as the raw uploaded file) to prevent malicious file disguised as an image (Risk R8).
  - [ ] 5.7 Run `npm test` and confirm all tests pass with no failures before marking this task complete.
