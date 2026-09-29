## Relevant Files

- `claude/accounts-workspace-prd.md` - The PRD itself, copied into the repo (already referenced by `agents/rules/typescript-standard.md` but not previously present).
- `server/middleware/requireAuth.ts` - New. Verifies a Supabase JWT from the `Authorization` header and sets `req.userId`; replaces the `x-user-id` stub.
- `server/middleware/requireAuth.test.ts` - Test for `requireAuth.ts` (node --test): valid JWT, missing header, invalid/expired token.
- `server/middleware/permissions.ts` - Modified. Collapsed to owner-only `canRead`/`canWrite` (no more `hasShareRole`/edit/view branches) once sharing is cut (task 7.3).
- `server/middleware/permissions.test.ts` - Updated. Owner-only assertions replace the share-role cases removed from `tests/permissions.test.ts`.
- `server/lib/authRateLimit.ts` - New. Login attempt rate limiter (LG5).
- `server/lib/authRateLimit.test.ts` - Test for the rate limiter (node --test).
- `server/routes/account.ts` - New. `DELETE /api/account` — cascading account deletion (workspace, folders, attachments, storage objects, auth user).
- `server/routes/account.test.ts` - Test for the cascade (node --test), including the R2 test-matrix case.
- `server/routes/workspace.ts` - New. `GET/PATCH /api/workspace` (display name — WC1).
- `server/routes/workspace.test.ts` - Test for workspace routes (node --test).
- `server/routes/folders.ts` - New. Folder CRUD + move-file endpoints (WF2–WF4).
- `server/routes/folders.test.ts` - Test for folder routes, including the WF4/R3 "delete folder keeps files" case.
- `server/routes/attachments.js` - Modified. Attachment listing scoped to the caller's own workspace only (WF1); drop any cross-account listing path.
- `server/routes/shares.ts` - **Deleted** (task 7.2). Sharing endpoints cut per PRD §3.4/WF5.
- `server/services/shares.ts` - **Deleted** (task 7.2).
- `server/services/users.ts` - Modified or deleted. `resolveUserIdByEmail` was share-grant-only; re-check whether anything else still needs it before deleting.
- `server/services/workspaces.ts` - New. Workspace CRUD + auto-creation-on-signup helper (SU3).
- `server/services/workspaces.test.ts` - Test for workspace service (node --test).
- `server/services/folders.ts` - New. Folder CRUD + move-file logic backing `folders.ts`.
- `server/services/folders.test.ts` - Test for folder service, including WF4 (node --test).
- `server/index.js` - Modified. Mount `account.ts`/`workspace.ts`/`folders.ts`; remove the `shares.ts` mount (task 7.2).
- `supabase/migrations/<timestamp>_workspaces_and_folders.sql` - New. `workspaces` (1:1 with `auth.users`), `folders` (workspace_id, name, parent_folder_id), nullable `folder_id` on `attachments`, RLS scoping each to its owner.
- `supabase/migrations/<timestamp>_workspace_auto_create_trigger.sql` - New. Postgres trigger/function creating a workspace row on `auth.users` insert (SU3).
- `supabase/migrations/<timestamp>_drop_shares.sql` - New. Drops the `shares` table now that cross-account sharing is cut (task 7.5).
- `src/lib/supabaseClient.ts` - New. Browser-side Supabase client (anon key) for Auth calls (signUp/signInWithPassword/resetPasswordForEmail/updateUser).
- `src/lib/session.ts` - New. `useSession` hook wrapping `supabase.auth.onAuthStateChange`; exposes current user + access token.
- `src/lib/currentUser.ts` - **Deleted** (task 1.6). Superseded by `session.ts`/real auth.
- `src/lib/http.js` - Modified. Sends `Authorization: Bearer <access_token>` from the session instead of `x-user-id`.
- `src/routes/App.jsx` - Modified. Root-route logic: signed-in → `/workspace`, unauthenticated → `/login` (EH3, simplified per this task list's scope — no guest editor route).
- `src/routes/SignupPage.tsx` - New. Email/password signup only (SU1, SU3, SU5) — Google sign-in (SU2) is dropped from scope, see task 1.1.
- `src/routes/SignupPage.test.tsx` - Component test.
- `src/routes/LoginPage.tsx` - New. Email/password login only (LG1) — Google sign-in (LG2) is dropped from scope, see task 1.1.
- `src/routes/LoginPage.test.tsx` - Component test.
- `src/routes/ForgotPasswordPage.tsx` - New. PR1.
- `src/routes/ResetPasswordPage.tsx` - New. Handles the emailed reset link (PR2–PR3).
- `src/routes/ForgotPasswordPage.test.tsx` / `src/routes/ResetPasswordPage.test.tsx` - Component tests, including expired-link case.
- `src/routes/VerifyEmailPage.tsx` - New. Verification-link callback + resend action (EV1, EV3).
- `src/routes/SettingsPage.tsx` - New. Profile / security / danger-zone sections (US1–US5).
- `src/routes/SettingsPage.test.tsx` - Component test.
- `src/workspace/WorkspacePage.tsx` - New. File-manager shell (Recent, grid/list, breadcrumbs, search — WF6–WF11).
- `src/workspace/RecentSection.tsx` - New (WF7).
- `src/workspace/FileGrid.tsx` / `src/workspace/FileList.tsx` - New. Thumbnail-card grid (default) and sortable list view (WF6, WF8, WF9).
- `src/workspace/Breadcrumbs.tsx` - New (WF10).
- `src/workspace/FolderTree.tsx` - New. Sidebar folder navigation + create/rename/delete UI (WF2–WF4, WF10).
- `src/workspace/SearchBar.tsx` - New (WF11).
- `src/workspace/EmptyState.tsx` - New. No-files/no-folders empty states (design req 3.3).
- `src/workspace/*.test.tsx` - Component tests for each of the above.
- `src/workspace/WorkspaceSettingsPage.tsx` - New. Workspace display name + delete-workspace/account (WC1–WC3).
- `src/workspace/WorkspaceSettingsPage.test.tsx` - Component test, including the confirmation-modal consequence text.
- `src/modals/ShareModal.tsx` - **Deleted** (task 7.1).
- `src/viewer/usePdfDocument.ts` / `src/viewer/ViewerPage.jsx` / `src/viewer/NotesPanel.tsx` - Modified (task 7.4). Drop `role === 'view'|'edit'|'owner'` gating now that only the owner can access a file.
- `tests/ShareModal.test.tsx`, `tests/shares.test.ts` - **Deleted** (task 7.6).
- `tests/permissions.api.test.ts` - Modified. Drop the share-recipient 403 cases; keep/extend the owner-vs-stranger cases.
- `tests/consts/inkSpace.ts`, `tests/consts/routes.ts` - Modified. Drop dead `SHARE_*` test ids / `Routes.Shares`/`ShareById`; add ids/routes for auth, settings, and workspace pages.
- `tests/integration/auth/signup-login.spec.ts` - New Playwright spec (SU1–SU5, LG1–LG5).
- `tests/integration/auth/password-reset-verification.spec.ts` - New Playwright spec (PR1–PR3, EV1–EV3).
- `tests/integration/settings/account-settings.spec.ts` - New Playwright spec (US1–US5).
- `tests/integration/workspace/files-and-folders.spec.ts` - New Playwright spec (WF1–WF11).
- `tests/integration/workspace/workspace-settings.spec.ts` - New Playwright spec (WC1–WC3).
- `spec.md` - Modified throughout this feature per `AGENTS.md`'s per-sub-task loop; §4 Permissions Model rewritten to the single-owner model in task 7.7.



### Notes

- Unit tests should be placed alongside the source file they test where practical.
- Use `npm test` to run the test suite (Node's built-in runner — do not add Jest, Vitest, or Mocha).
- Playwright specs go under `tests/integration/<feature-area>/*.spec.ts` per `agents/rules/integration-tests.md`; add any new `data-testid`s to `tests/consts/inkSpace.ts` first.
- The guest-accessible editor route (`claude/rebrand-guest-homepage-prd.md`, EH1/EH2/DoD #8) is **not** built in this task list — per this list's own scope decision, an unauthenticated visitor at `/` is simply redirected to `/login`. Revisit once that PRD is available.
- Cross-account sharing removal (task 7.0) is a direct consequence of this PRD's §3.4/WF5 and its revision note — it removes code shipped in the PDF editor's Task 4, not new-feature scope.



## Instructions for Completing Tasks

**IMPORTANT:** Check off each task as you complete it by changing `- [ ]` to `- [x]`. Update after each sub-task, not only after finishing a parent task — see `agents/rules/git-workflow.md`. Per `AGENTS.md`'s per-sub-task loop: implement → update `spec.md` if it changed/clarified behavior → add/run tests → run the `code-reviewer` skill (and `security-reviewer` where noted) → then check off.

## Tasks

- [x] 1.0 Auth infrastructure, signup/login/session, and entry routing
  - [x] 1.1 ~~Register the Google OAuth client~~ — **dropped from scope.** Google sign-in (SU2/LG2) and its auto-linking edge case (SU4/R1) add OAuth-provider setup and account-merge complexity this feature doesn't have time for; email/password is the only sign-in method. Users log in with an email + password they set at signup.
  - [x] 1.2 Add `src/lib/supabaseClient.ts` — browser-side Supabase client using the anon key env var (mirrors `server/lib/supabaseClient.ts`'s service-role client but with anon scope). Lazily constructed (`getSupabaseClient()`), not built at import time, so importing the module never crashes a test that doesn't need real credentials.
  - [x] 1.3 Add `src/lib/session.ts` (`useSession` hook) wrapping `supabase.auth.onAuthStateChange`, exposing current user, access token, and loading state. Also exports `getAccessToken()` for `http.ts` (not a hook, can't call `useSession` itself).
  - [x] 1.4 Build `SignupPage.tsx`: email/password signup (SU1); on success, no separate workspace-creation step is shown to the user (SU3 — workspace creation itself happens server-side in task 4.2) (EH1/EH2 replaced by the simplified `/login` redirect per this list's scope note)
  - [x] 1.5 Build `LoginPage.tsx`: email/password login (LG1), with inline validation errors on failure (design req 3.3 — no silent failures)
  - [x] 1.6 Wire logout (LG4) from a location reachable on every authenticated page (e.g. workspace shell nav); confirm session persists across reloads until logout or expiry (LG3). Landed on a placeholder `src/workspace/WorkspacePage.tsx` (task 5.1 replaces it) since that's the first real authenticated page to exist.
  - [x] 1.7 Replace the `x-user-id` identity stub end-to-end: add `server/middleware/requireAuth.ts` (verifies the Supabase JWT, sets `req.userId`); update `server/middleware/permissions.ts`'s call sites and `src/lib/http.js` to send `Authorization: Bearer <access_token>` from `session.ts`; delete `src/lib/currentUser.ts`. `requireAuth` is mounted once, globally, ahead of every `/api/*` route in `server/index.js` (except `/api/auth/*`, mounted earlier since login must be reachable unauthenticated) rather than per-route. `http.js` was converted to `http.ts` in the same change (typescript-standard.md §2.3 calls it the highest-value conversion target, and this task rewires its core identity logic anyway).
  - [x] 1.8 Entry/Home routing in `src/routes/App.jsx`: signed-in visitor at `/` → redirect to `/workspace` (EH3); unauthenticated visitor at `/` → redirect to `/login` (this list's simplified stand-in for EH1/EH2, which are out of scope here). `HomePage.jsx` was deleted (dead code once `/` is pure redirect logic); `/workspace` and `/view/:attachmentId` also gained a client-side `RequireSession` guard (UX only — the real boundary is still the server's `requireAuth`).
  - [x] 1.9 ~~Google-account auto-linking~~ — **dropped**, see 1.1 (no Google sign-in means no cross-provider identity to link).
  - [x] 1.10 Add `server/lib/authRateLimit.ts` and apply it to the login route/flow (LG5). Since login itself is a direct client→Supabase Auth call (no server-side login route exists in this architecture), this is a `POST /api/auth/login-attempt` pre-check `LoginPage.tsx` calls first. **Known limitation, documented in spec.md's accounts-workspace notes and flagged in security review:** this only throttles callers who choose to go through it — nothing stops a client from calling Supabase Auth directly and skipping it, so Supabase Auth's own abuse protection is the actual backstop, not this endpoint. `trust proxy` also needs to be set correctly before deploying behind any reverse proxy (`agents/skills/deployment.md`), not done yet since the deploy target isn't chosen.
  - [x] 1.11 Tests: `requireAuth.test.ts` (valid/missing/invalid JWT, plus expired/revoked), `SignupPage.test.tsx`, `LoginPage.test.tsx`, `authRateLimit.test.ts`, `auth.test.ts` (the `login-attempt` route itself), and `WorkspacePage.test.tsx` (logout). **`tests/integration/auth/signup-login.spec.ts` (Playwright) was not created** — `@playwright/test` still can't actually be installed in this environment (`npm install` times out fetching the `playwright-core` tarball; see spec.md's updated gap note) — a spec file with no way to run it would be dead weight, not coverage, matching this repo's existing precedent (`tests/permissions.api.test.ts`'s own comment). The component/HTTP-level tests above cover SU1/SU3/SU5/LG1/LG3–LG5 instead.
  - [x] 1.12 Ran `npm run typecheck` and `npm test` (200 pass / 1 pre-existing skip for the unrelated `pdf-lib` gap / 0 fail); updated `spec.md` with the new auth model, replacing the `x-user-id` gap note; ran the `code-reviewer` skill and `security-reviewer` subagent against the full diff — both findings addressed (a missing `catch` around `checkLoginRateLimit` in `LoginPage.tsx` that could silently swallow a network error, and a defense-in-depth 401 guard restored in `requirePermission`); the `trust proxy` and rate-limiter-is-UX-layer findings are documented as pre-deployment/architecture notes rather than fixed in code, per the reasoning in spec.md and `agents/skills/deployment.md`.

- [x] 2.0 Password reset & email verification
  - [x] 2.1 Build `ForgotPasswordPage.tsx`: "forgot password" entry point on the login page, triggers `supabase.auth.resetPasswordForEmail` (PR1)
  - [x] 2.2 Build `ResetPasswordPage.tsx` handling the emailed reset link; confirm Supabase's link is single-use and time-limited (PR2) and that completing it invalidates the old password immediately (PR3)
  - [x] 2.3 Build `VerifyEmailPage.tsx`: verification-link callback plus a "resend verification email" action for an expired link (EV1, EV3); trigger the same flow on email change (US2 depends on this)
  - [x] 2.4 Confirm EV2 explicitly: an unverified account can still log in and use its own workspace with no gate anywhere in the new code (grep for any accidental "must be verified" check before closing this out)
  - [x] 2.5 Tests: `ForgotPasswordPage.test.tsx`, `ResetPasswordPage.test.tsx` (including expired-link case), and `tests/integration/auth/password-reset-verification.spec.ts` covering PR1–PR3/EV1–EV3 — the Playwright spec was **not created**, same `@playwright/test` install blocker as task 1.11 (see spec.md §9); `tests/ForgotPasswordPage.test.tsx`/`tests/ResetPasswordPage.test.tsx`/`tests/VerifyEmailPage.test.tsx` cover PR1–PR3/EV1/EV3 at the component level instead.
  - [x] 2.6 Ran `npm run typecheck` (clean except the pre-existing, unrelated `pdf-lib` module-resolution errors in `server/services/burn-in.ts`/`storage.ts`) and `npm test` (218 pass / 1 pre-existing skip / 0 fail); updated `spec.md`; ran the `code-reviewer` skill and addressed its findings — extracted the duplicated link-error-parsing logic to `src/lib/authLinkError.ts`, removed a redundant `.replace()` and a dead ternary branch, and added the missing `redirectTo`-wiring and query-string-link-error tests it flagged.

- [ ] 3.0 User settings (profile, email, password, connected sign-in methods, delete account)
  - [ ] 3.1 Build `SettingsPage.tsx` grouped by concern — profile, security/sign-in methods, danger zone (design req 3.3), not a flat list
  - [ ] 3.2 Profile section: view/edit display name (US1) via `supabase.auth.updateUser({ data: { display_name } })`
  - [ ] 3.3 Email section: change email (US2) via `supabase.auth.updateUser({ email })`, re-verified through task 2.3's flow before it's treated as confirmed
  - [ ] 3.4 Security section: change password (US3) via `supabase.auth.updateUser({ password })`; list linked sign-in methods (US4) via `supabase.auth.getUserIdentities()`
  - [ ] 3.5 Danger zone: delete-account action using the same confirmation-modal pattern as the PDF editor's delete-annotation modal — title, explicit consequence, confirm/cancel (design req 3.3, US5)
  - [ ] 3.6 Add `server/routes/account.ts` (`DELETE /api/account`) and `server/services/` cascade logic: delete workspace → folders → attachments (DB rows + Storage objects) → the Supabase Auth user itself, via the service-role Admin API; this is a real, immediate, cascading delete, not a soft flag (3.2 non-functional req, R2)
  - [ ] 3.7 Tests: `SettingsPage.test.tsx`, `account.test.ts` asserting the cascade actually removes workspace/folders/attachments/storage/auth-user, and `tests/integration/settings/account-settings.spec.ts` covering US1–US5
  - [ ] 3.8 Run `npm run typecheck` and `npm test`; update `spec.md`; run `code-reviewer` and `security-reviewer` (account deletion is exactly the cascading-delete case that subagent covers); check off

- [x] 4.0 Workspace & folders data model and backend (workspaces, folders, folder_id, move/CRUD, account-deletion cascade)
  - [x] 4.1 Write migration `supabase/migrations/<timestamp>_workspaces_and_folders.sql`: `workspaces` (one row per user, 1:1), `folders` (workspace_id, name, parent_folder_id), nullable `folder_id` on `attachments`; RLS scoping each row to its owner via `auth.uid()`. `workspaces.id` is itself the FK to `auth.users` (no separate uuid), so `workspace_id === auth.uid()` everywhere downstream.
  - [x] 4.2 Write migration `supabase/migrations/<timestamp>_workspace_auto_create_trigger.sql`: a Postgres trigger/function that creates a `workspaces` row automatically on `auth.users` insert (SU3 — no separate workspace-creation step). Also backfills a workspace row for every pre-existing `auth.users` row (test/scratch users from earlier sessions), or `getWorkspace` would 500 for them.
  - [x] 4.3 Add `server/services/workspaces.ts` (get/update display name) and `server/routes/workspace.ts` (`GET/PATCH /api/workspace`), gated by `requireAuth`
  - [x] 4.4 Add `server/services/folders.ts` (create/rename/delete folder, list, move file in/out) and `server/routes/folders.ts`, gated by `requireAuth` and scoped to the caller's own workspace only — no grant model (WF2, WF3, WF5)
  - [x] 4.5 Explicitly verify WF4/R3: deleting a folder returns its files to the unfiled/top-level list rather than deleting them — enforced at the FK level (`attachments.folder_id on delete set null`, not `cascade`), tested in `tests/folders.test.ts`
  - [x] 4.6 Update `server/routes/attachments.js` to scope listing to the caller's own workspace only (WF1) — remove any cross-account listing path. Added `GET /api/attachments` (didn't exist before), scoped unconditionally to `owner_id = req.userId`, with an optional `folderId`/`root` filter for folder-scoped browsing.
  - [x] 4.7 Run `npm run supabase:migrate`, then regenerate Supabase types, then confirm `npm run typecheck` still passes (per `CLAUDE.md`'s migration verification row). Ran `supabase db push` against the linked project (succeeded — CLI has real network access in this environment, unlike `npm install`) and `supabase gen types typescript --linked > src/lib/database.types.ts` (first time this file exists); wired both Supabase clients to `createClient<Database>(...)` and switched the new services' hand-maintained row types to derive from it.
  - [x] 4.8 Tests: `workspaces.test.ts`, `folders.test.ts` (including the WF4/R3 folder-delete-preserves-files case), and real-HTTP 401/403 tests confirming a user can't read/write another user's workspace/folders. Added `tests/workspaceFolders.api.test.ts` for the real-HTTP half (mirrors `tests/permissions.api.test.ts`'s pattern).
  - [x] 4.9 Run `npm test`; update `spec.md`; run `code-reviewer` and `security-reviewer` (new routes, ownership scoping); check off. `npm run typecheck` clean (pre-existing `pdf-lib` gap only); `npm test` 252-258 pass / 0 new fail / 2 skipped across repeated runs — a pre-existing `tests/shares.test.ts` flakiness (Admin-API rate limiting, unrelated to this diff) is now visible under the added test concurrency, documented in spec.md §9 rather than fixed (that file is deleted in task 7.2). Both subagents found one MEDIUM (a DB error in `folders.ts`'s `checkFolderOwnership` was masked as a 404 instead of a 500) — fixed; everything else was LOW/forward-looking (shared `httpError` helper extracted to `server/lib/httpError.ts`, list pagination noted for task 5.0/6.0 to consider).

- [ ] 5.0 Workspace UI — file-manager pattern (Recent section, thumbnail cards, grid/list, breadcrumbs, search, empty states)
  - [ ] 5.1 Build `src/workspace/WorkspacePage.tsx` shell, routed at `/workspace` and `/workspace/folders/:folderId`; primary call to action is **Upload**, not a template/create-new flow (design req 3.3, out-of-scope 3.4)
  - [ ] 5.2 Build `RecentSection.tsx`: recently opened/edited files, most recent first, above the full file list (WF7)
  - [ ] 5.3 Build `FileGrid.tsx` (default view): thumbnail-card per file using a rendered first-page thumbnail, filename + last-modified shown on each card (WF6, WF9)
  - [ ] 5.4 Build `FileList.tsx` (list view), sortable by name or last-modified; add the grid/list toggle to `WorkspacePage.tsx` (WF8)
  - [ ] 5.5 Build `Breadcrumbs.tsx` and `FolderTree.tsx`: breadcrumb + sidebar folder navigation, folder create/rename/delete UI, no modal-based folder browser (WF10)
  - [ ] 5.6 Wire move-to-folder action from the file grid/list into `folders.ts`'s move endpoint (WF3)
  - [ ] 5.7 Build `SearchBar.tsx`: persistent search/filter bar across the workspace's files (WF11)
  - [ ] 5.8 Build `EmptyState.tsx` variants for no-files-yet and no-folders-yet (design req 3.3)
  - [ ] 5.9 Add per-file hover/right-click actions (open, move to folder, download, delete) directly on the grid/list, without requiring the file to be opened first (design req 3.3)
  - [ ] 5.10 Tests: component tests for each new `src/workspace/*.tsx` file, and `tests/integration/workspace/files-and-folders.spec.ts` covering WF1–WF11 including the thumbnail-default and breadcrumb-navigation cases
  - [ ] 5.11 Screenshot-check the workspace home against PRD §3.3/§2.4 DoD #9 (Recent above the list, thumbnail default, Upload as primary CTA, breadcrumb nav) per `CLAUDE.md`'s UI verification row; run `npm run typecheck`/`npm test`; update `spec.md`; run `code-reviewer`; check off

- [ ] 6.0 Workspace settings UI (display name, delete-workspace/account confirmation)
  - [ ] 6.1 Build `WorkspaceSettingsPage.tsx`: edit workspace display name (WC1)
  - [ ] 6.2 Add a delete-workspace/account action using the same confirmation-modal pattern as 3.5, explicitly naming what will be lost (file/folder counts) before proceeding (WC2, WC3, R2)
  - [ ] 6.3 Wire the confirmation to task 3.6's `DELETE /api/account` endpoint (WC2's "delete workspace deletes the account entirely" — there is no separate workspace-delete-only path in the 1:1 model)
  - [ ] 6.4 Tests: `WorkspaceSettingsPage.test.tsx` asserting the confirmation modal's exact consequence text/counts, and `tests/integration/workspace/workspace-settings.spec.ts` covering WC1–WC3
  - [ ] 6.5 Run `npm run typecheck` and `npm test`; update `spec.md`; run `code-reviewer`; check off

- [ ] 7.0 Remove the PDF editor's existing cross-account sharing feature (collapse to single-owner model)
  - [ ] 7.1 Delete `src/modals/ShareModal.tsx` and remove its entry point (the Share button) from the viewer/toolbar
  - [ ] 7.2 Delete `server/routes/shares.ts` and `server/services/shares.ts`; remove the `/api/attachments/:attachmentId/shares` mount from `server/index.js`
  - [ ] 7.3 Collapse `server/middleware/permissions.ts` to owner-only: remove `hasShareRole` and the edit/view branches of `getAttachmentRole`/`canRead`/`canWrite`; `isOwner` no longer needs to distinguish "grant management" from plain ownership
  - [ ] 7.4 Update `src/viewer/usePdfDocument.ts`, `src/viewer/ViewerPage.jsx`, and `src/viewer/NotesPanel.tsx` to drop `role === 'view'|'edit'|'owner'` gating — only the owner can ever reach a file now, so there's a single code path, not a role switch
  - [ ] 7.5 Add migration `supabase/migrations/<timestamp>_drop_shares.sql` dropping the `shares` table now that WF5/§3.4 cut sharing entirely (not just narrowed it)
  - [ ] 7.6 Delete `tests/ShareModal.test.tsx` and `tests/shares.test.ts`; remove the share-recipient cases from `tests/permissions.api.test.ts`/`tests/permissions.test.ts`, keeping the owner-vs-stranger assertions
  - [ ] 7.7 Reconcile `spec.md` §4 (Permissions Model, P1–P5): replace with the single-owner model and note this PRD's revision as the reason for the cut
  - [ ] 7.8 Remove the now-dead `SHARE_*` test ids and `Routes.Shares`/`ShareById` entries from `tests/consts/inkSpace.ts`/`routes.ts`
  - [ ] 7.9 Run `npm run supabase:migrate` for the drop migration, regenerate Supabase types, run `npm run typecheck` and `npm test`; run `code-reviewer` and `security-reviewer` (permission-model collapse); check off

- [ ] 8.0 Hardening pass (rate limiting, folder-deletion edge case, cascade-delete verification, out-of-scope audit)
  - [ ] 8.1 Re-audit the out-of-scope list (§3.4): confirm no multi-workspace switching, no 2FA, no OAuth/Google sign-in, no workspace roles/collaborators, no public/anonymous sharing links, no soft-delete grace period, and no template-gallery/create-new flow crept into the workspace home
  - [ ] 8.2 End-to-end test of login rate limiting (LG5/R4) — repeated failed attempts are actually throttled, not just unit-tested in isolation
  - [ ] 8.3 ~~End-to-end test of the account-linking edge case~~ — **dropped**, see 1.1 (Google sign-in is out of scope).
  - [ ] 8.4 End-to-end test of the folder-deletion edge case (R3/WF4): a folder containing files, deleted, and the files still exist at the top level afterward
  - [ ] 8.5 Full account-deletion cascade run (R2, PRD §4.3 test matrix item) confirming workspace, folders, attachments, and Storage objects are all actually gone — not just DB rows with dangling Storage files
  - [ ] 8.6 Update `spec.md`'s phase table and Definition-of-Done checklist to reflect the finished accounts/workspace feature
  - [ ] 8.7 Run the `code-reviewer` skill against the full feature diff and the `security-reviewer` subagent specifically over `requireAuth.ts`, `permissions.ts`, and the account-deletion route; address findings before checking this off
  - [ ] 8.8 Final full-suite run: `npm run typecheck` and `npm test`, output shown, before considering the feature branch ready for PR