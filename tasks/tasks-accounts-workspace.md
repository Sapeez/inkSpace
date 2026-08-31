## Relevant Files

- `src/pages/Welcome.jsx` - Minimal welcome screen for unauthenticated visitors (EH1–EH3).
- `src/pages/Signup.jsx` - Signup form: email/password and Google OAuth entry points (SU1–SU5).
- `src/pages/Login.jsx` - Login form: email/password and Google OAuth, with "forgot password" link (LG1–LG5).
- `src/pages/ResetPassword.jsx` - Password reset request form and reset-link landing page (PR1–PR3).
- `src/pages/VerifyEmail.jsx` - Email verification landing page (expired-link re-send included) (EV1–EV3).
- `src/pages/Settings.jsx` - User settings: profile name, email change, password change, connected sign-in methods, delete account (US1–US5).
- `src/pages/Workspace.jsx` - Main workspace shell: Files & Folders, Recent section, grid/list toggle, search bar (WF1–WF11).
- `src/pages/SharedWithMe.jsx` - "Shared with me" view listing incoming grants (WS1–WS3).
- `src/pages/MembersAccess.jsx` - Owner's single-page view of all outgoing grants with revocation (WM1–WM3).
- `src/pages/WorkspaceSettings.jsx` - Workspace display name edit and delete-workspace/account flow (WC1–WC3).
- `src/components/Auth/GoogleOAuthButton.jsx` - Reusable Google sign-in button used on both Signup and Login pages.
- `src/components/Auth/VerificationBanner.jsx` - Inline banner shown when an unverified account tries to share (EV2).
- `src/components/Workspace/FileCard.jsx` - Thumbnail card view of a single file (WF6, WF9).
- `src/components/Workspace/FileRow.jsx` - List-view row for a single file, sortable (WF8, WF9).
- `src/components/Workspace/FolderBreadcrumb.jsx` - Breadcrumb navigation for folder drilling (WF10).
- `src/components/Workspace/FolderActionsMenu.jsx` - Context menu for create/rename/delete folder actions (WF2).
- `src/components/Workspace/MoveFileModal.jsx` - Modal to move a file into or out of a folder (WF3).
- `src/components/Workspace/DeleteFolderModal.jsx` - Confirmation modal explaining files will NOT be deleted (WF4, R4).
- `src/components/Workspace/SearchBar.jsx` - Persistent search/filter bar across workspace files (WF11).
- `src/components/Settings/DeleteAccountModal.jsx` - Confirmation modal for account deletion naming exact consequences (US5, WC2, R3).
- `src/router/index.jsx` - App router: unauthenticated → welcome, authenticated → workspace (EH3).
- `src/hooks/useAuth.js` - Auth state hook (session, user, sign-out helper) wrapping Supabase Auth.
- `src/hooks/useWorkspace.js` - Hook for fetching/mutating files, folders, and workspace data.
- `server/routes/auth.js` - Server-side auth helpers: account-linking logic, Google verified-email check (SU4, R2).
- `server/routes/folders.js` - CRUD endpoints for folders; delete endpoint moves files to root (WF2–WF4).
- `server/routes/workspace.js` - Endpoints: list files, move file to folder, list recent files (WF1, WF3, WF7).
- `server/routes/grants.js` - Endpoints: list outgoing grants (Members/Access), list incoming grants (Shared with me), revoke (WM1–WM3, WS1–WS3).
- `server/middleware/requireAuth.js` - Middleware that rejects unauthenticated requests with 401.
- `supabase/migrations/XXXXXXXXXXXXXX_accounts_workspace.sql` - Schema: `workspaces`, `folders` tables; `folder_id` nullable FK on `attachments`.
- `tests/auth.test.js` - Unit tests for account-linking logic and verified-email guard (SU4, R2).
- `tests/folders.test.js` - Unit tests for folder CRUD, especially delete-without-deleting-files (WF4, R4).
- `tests/grants.test.js` - Unit tests for grant listing and revocation endpoints (WM2, WS3, R5).
- `tests/workspace.api.test.js` - Integration tests: unauthenticated request → 401; view-only user → cannot mutate.



### Notes

- Unit tests should be placed in the `tests/` directory, named after the file they test.
- Use `npm test` to run the test suite (`node --test` — do not add Jest, Vitest, or Mocha).
- Supabase Auth handles email/password and Google OAuth — do not roll your own password hashing or token generation.
- All auth state reads must go through the Supabase client; never trust client-supplied user IDs on the server — always read identity from the verified JWT.
- The `shares` / permissions table is shared with the PDF editor PRD — do not create a second table; this project only adds `workspaces`, `folders`, and `folder_id`.



## Instructions for Completing Tasks

**IMPORTANT:** Check off each task as you complete it by changing `- [ ]` to `- [x]`. Update after each sub-task, not only after finishing a parent task.

## Tasks

- [ ] 0.0 Create feature branch
  - [ ] 0.1 Create and checkout a new branch: `git checkout -b feature/accounts-workspace`

- [ ] 1.0 Setup & Auth Infrastructure
  - [ ] 1.1 Register a Google OAuth client in Google Cloud Console: create OAuth 2.0 credentials, set the authorised redirect URI to your Supabase project's callback URL (`https://<project>.supabase.co/auth/v1/callback`), and copy the client ID and secret. Store them as environment variables (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) — never hardcode them.
  - [ ] 1.2 Enable Google as a provider in the Supabase Auth dashboard and paste in the client ID and secret from 1.1.
  - [ ] 1.3 Write `supabase/migrations/XXXXXXXXXXXXXX_accounts_workspace.sql`: create a `workspaces` table (`id`, `user_id` unique FK → `auth.users`, `display_name`, `created_at`); create a `folders` table (`id`, `workspace_id` FK → `workspaces`, `name`, `parent_id` nullable self-FK, `created_at`); add a nullable `folder_id` column (FK → `folders`) to the existing `attachments` table.
  - [ ] 1.4 Run `npm run supabase:migrate` and confirm the migration applies without errors.
  - [ ] 1.5 Add a Supabase database trigger (or server-side hook called after signup) that inserts a row into `workspaces` automatically when a new row is inserted into `auth.users` — this fulfils the "workspace created automatically" requirement (SU3).
  - [ ] 1.6 Create `server/middleware/requireAuth.js`: extract the bearer token from `Authorization` header, verify it with the Supabase client, and attach the verified user object to `req.user`; return 401 if the token is missing or invalid.
  - [ ] 1.7 Set up the client-side Supabase client (`src/lib/supabase.js`) using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` environment variables.
  - [ ] 1.8 Create `src/router/index.jsx`: define routes for `/` (welcome), `/signup`, `/login`, `/reset-password`, `/verify-email`, `/workspace`, `/workspace/shared`, `/workspace/members`, `/workspace/settings`, and `/settings`; add a route guard that redirects unauthenticated users to `/` and authenticated users away from `/` to `/workspace` (EH3).

- [ ] 2.0 Entry Route, Signup, Login & Session
  - [ ] 2.1 Create `src/pages/Welcome.jsx`: display the app name, a one-line description, and Login / Sign up buttons. No marketing content — no feature lists, testimonials, or pricing (EH1, EH2).
  - [ ] 2.2 Create `src/components/Auth/GoogleOAuthButton.jsx`: a button that calls `supabase.auth.signInWithOAuth({ provider: 'google' })`. Reuse this on both Signup and Login pages.
  - [ ] 2.3 Create `src/pages/Signup.jsx`: a form with email, password, and confirm-password fields plus the `GoogleOAuthButton`. Show inline validation errors (non-empty, valid email format, password minimum length, passwords match) — never a silent failure (SU1, SU2).
  - [ ] 2.4 On email/password signup success, call `supabase.auth.signUp()`; on Google signup, use `signInWithOAuth`. In both cases, redirect to `/workspace` after success — the workspace already exists because of the trigger from 1.5 (SU3).
  - [ ] 2.5 Create `server/routes/auth.js`: add a POST `/api/auth/link-google` endpoint that is called server-side after a Google OAuth callback. Check Google's `email_verified` claim — if `true` and the email matches an existing `auth.users` row, link the Google identity to that account using Supabase's admin API; if `email_verified` is `false`, treat it as a brand-new signup (SU4, R2).
  - [ ] 2.6 Create `src/pages/Login.jsx`: email/password fields, a `GoogleOAuthButton`, and a "Forgot password?" link to `/reset-password`. Show a visible error message on wrong credentials — never a silent failure (LG1, LG2).
  - [ ] 2.7 Create `src/hooks/useAuth.js`: expose `user`, `session`, `loading`, and `signOut()`. Subscribe to `supabase.auth.onAuthStateChange` so the app reacts to login, logout, and token refresh automatically (LG3, LG4).
  - [ ] 2.8 Add a Logout button (visible from any authenticated page via the nav/header) that calls `supabase.auth.signOut()` and redirects to `/` (LG4).
  - [ ] 2.9 Confirm that Supabase Auth's built-in rate-limiting is active for email/password login attempts, and document the threshold in a code comment in `server/routes/auth.js` (LG5).

- [ ] 3.0 Password Reset, Email Verification & User Settings
  - [ ] 3.1 Create `src/pages/ResetPassword.jsx` (two states): (a) the request form — an email field that calls `supabase.auth.resetPasswordForEmail()`; (b) the reset form — shown when the user arrives via the emailed link, with new-password and confirm fields that call `supabase.auth.updateUser({ password })`. Show a success message in both states (PR1–PR3).
  - [ ] 3.2 Create `src/pages/VerifyEmail.jsx`: Supabase automatically sends a verification email on signup; this page is the landing page for that link. If the link is valid, show a "Email verified" confirmation. If the token is expired, show a "Link expired" message with a "Re-send verification email" button that calls `supabase.auth.resend({ type: 'signup', email })` (EV1, EV3).
  - [ ] 3.3 Create `src/components/Auth/VerificationBanner.jsx`: a dismissible banner that reads "Verify your email to share files" and links to `/verify-email`. Render it at the top of the workspace whenever `user.email_confirmed_at` is null (EV2).
  - [ ] 3.4 In `server/routes/shares.js` (from the PDF editor PRD): add a guard that reads the calling user's `email_confirmed_at` from Supabase Auth and returns 403 with the message `"Email verification required"` if the account is unverified — both for granting and for being listed as a valid recipient (EV2, WS2).
  - [ ] 3.5 Create `src/pages/Settings.jsx` grouped into three sections:
    - **Profile** — display name field (read from `workspaces.display_name`, saved via PATCH to `/api/workspace`) (US1).
    - **Security / Sign-in** — show connected methods (email/password, Google) read from Supabase Auth; a "Change password" form (current + new password) calling `supabase.auth.updateUser()`; a "Change email" field that calls `supabase.auth.updateUser({ email })` and informs the user a verification email has been sent (US2–US4).
    - **Danger zone** — a "Delete account" button that opens `DeleteAccountModal` (US5).
  - [ ] 3.6 Create `src/components/Settings/DeleteAccountModal.jsx`: modal title "Delete account?", body text listing exactly what will be deleted (workspace, files, active grants), and Confirm / Cancel buttons. On confirm, call `DELETE /api/account` and redirect to `/` (US5, WC2, R3).
  - [ ] 3.7 Add `DELETE /api/account` in `server/routes/auth.js`: verify the caller's identity via `requireAuth`, then delete (in order) all permission/share rows they granted or received, all attachments they own from Supabase Storage and the `attachments` table, all their folders, their workspace row, and finally their `auth.users` row via the Supabase admin API. This must be a real cascading delete, not a soft flag (US5, WC2).

- [ ] 4.0 Workspace — Files & Folders
  - [ ] 4.1 Create `server/routes/workspace.js` with the following endpoints, all protected by `requireAuth`:
    - `GET /api/workspace/files` — returns all attachments owned by the calling user, including `folder_id`, thumbnail URL, last-modified date, and a boolean `has_active_share` (WF1, WF9).
    - `GET /api/workspace/recent` — returns the 10 most recently opened/edited attachments for the calling user (WF7).
    - `PATCH /api/workspace/files/:id/move` — accepts `{ folder_id: <uuid | null> }` and updates `attachments.folder_id`; validates that the folder belongs to the same workspace (WF3).
    - `PATCH /api/workspace` — updates `workspaces.display_name` for the calling user (WC1).
  - [ ] 4.2 Create `server/routes/folders.js` with the following endpoints, all protected by `requireAuth`:
    - `POST /api/folders` — creates a new folder in the user's workspace (WF2).
    - `PATCH /api/folders/:id` — renames a folder; validates ownership (WF2).
    - `DELETE /api/folders/:id` — deletes the folder row and sets `folder_id = NULL` on all attachments that were inside it — **never delete the files themselves** (WF4, R4).
  - [ ] 4.3 Create `src/hooks/useWorkspace.js`: fetch files and recent files from the endpoints in 4.1; expose helpers for move, folder create/rename/delete. Keep state in sync after mutations without requiring a full page reload.
  - [ ] 4.4 Create `src/components/Workspace/FileCard.jsx`: displays the first-page thumbnail (from Supabase Storage signed URL), filename, last-modified time, and a small sharing-indicator icon when `has_active_share` is true (WF6, WF9).
  - [ ] 4.5 Create `src/components/Workspace/FileRow.jsx`: a compact list-view row showing the same fields as the card; columns must be sortable by name and last-modified date (WF8, WF9).
  - [ ] 4.6 Create `src/components/Workspace/FolderBreadcrumb.jsx`: shows the current folder path as clickable crumbs ("My Files › Folder A › Sub-folder"); clicking a crumb navigates up to that level. No modal-based folder browser — navigation is always in-place (WF10).
  - [ ] 4.7 Create `src/components/Workspace/FolderActionsMenu.jsx`: a context menu (right-click or hover menu) with "New folder", "Rename", and "Delete" actions for a folder (WF2).
  - [ ] 4.8 Create `src/components/Workspace/DeleteFolderModal.jsx`: title "Delete folder?", body "The folder will be deleted. The files inside it will be moved to your main file list." with Confirm / Cancel buttons (WF4, R4).
  - [ ] 4.9 Create `src/components/Workspace/MoveFileModal.jsx`: a flat list of the user's folders; the user picks one (or "Remove from folder" to move to root) and confirms (WF3).
  - [ ] 4.10 Create `src/components/Workspace/SearchBar.jsx`: a text input that filters the visible file list client-side by filename in real time; it persists across folder navigation (WF11).
  - [ ] 4.11 Create `src/pages/Workspace.jsx`: compose all of the above components. Layout: `VerificationBanner` (if unverified) → Recent section (horizontal scroll of `FileCard`) → search bar → grid/list toggle → folder breadcrumb → file grid (default) or file list. Primary call to action is an **Upload** button — no "create new" or template-picker flow (WF7, WF8, 3.3).
  - [ ] 4.12 Add empty states: no folders yet (show a soft prompt to create one), no files at all (show an Upload prompt), no search results (show "No files match your search").
  - [ ] 4.13 Write `tests/folders.test.js`: test (a) creating a folder, (b) renaming a folder, (c) deleting a folder that contains files and confirming the files' `folder_id` is set to `NULL` and the files still exist, (d) attempting to delete another user's folder and receiving 403.

- [ ] 5.0 Shared with Me, Members/Access & Workspace Settings
  - [ ] 5.1 Create `server/routes/grants.js` with the following endpoints, all protected by `requireAuth`:
    - `GET /api/grants/incoming` — returns all shares where `grantee_email` matches the calling user's verified email (WS1, WS2). Reads directly from the `shares` table used by the PDF editor — no second table (R5).
    - `GET /api/grants/outgoing` — returns all shares granted by the calling user, grouped by file (WM1).
    - `DELETE /api/grants/:id` — owner-only revocation; verifies the calling user is `granted_by` before deleting the row (WM2, WS3).
  - [ ] 5.2 Create `src/pages/SharedWithMe.jsx`: fetch from `/api/grants/incoming` and render each entry as a file card with the granting user's name and the access level (edit / view). Show an empty state when there are no incoming grants ("No files have been shared with you yet") (WS1–WS3).
  - [ ] 5.3 Create `src/pages/MembersAccess.jsx`: fetch from `/api/grants/outgoing` and render a table with columns: File, Grantee email, Access level, Revoke button. Show an empty state when no grants exist ("You haven't shared any files yet") (WM1–WM3).
  - [ ] 5.4 Wire up revocation: clicking Revoke in `MembersAccess` calls `DELETE /api/grants/:id` and immediately removes the row from both the local state in `MembersAccess` and from the grantee's `SharedWithMe` view on their next fetch (WM2, WS3, R5).
  - [ ] 5.5 Create `src/pages/WorkspaceSettings.jsx`: a "Workspace name" text field (reads/writes `workspaces.display_name` via the PATCH endpoint from 4.1) and a "Delete workspace" button that opens `DeleteAccountModal` — deleting the workspace deletes the account, per the 1:1 model (WC1–WC3).
  - [ ] 5.6 Add workspace settings, Shared with me, and Members/Access links to the workspace sidebar/nav so users can reach them from any workspace page.
  - [ ] 5.7 Write `tests/grants.test.js`: test (a) incoming grants only return shares matching the verified email of the calling user, (b) revoking a grant as the owner deletes the row, (c) attempting to revoke a grant the caller did not create returns 403, (d) a revoked grant no longer appears in the incoming list.

- [ ] 6.0 Hardening Pass
  - [ ] 6.1 Go through the out-of-scope list (PRD section 3.4) and confirm none of the following exist: multiple workspaces, workspace switching, folder-level sharing, 2FA, non-Google OAuth providers, workspace roles beyond owner/grantee, public/anonymous sharing links, soft/reversible account deletion, a marketing/landing page, a template gallery or "create new" flow. Remove anything found.
  - [ ] 6.2 Write `tests/auth.test.js`: test (a) Google signup with a new email creates a new account, (b) Google signup where `email_verified: true` and the email matches an existing account links the identities rather than creating a duplicate, (c) Google signup where `email_verified: false` creates a brand-new account (SU4, R2).
  - [ ] 6.3 Write `tests/workspace.api.test.js`: integration tests — (a) an unauthenticated `GET /api/workspace/files` returns 401, (b) `DELETE /api/folders/:id` for another user's folder returns 403, (c) `DELETE /api/grants/:id` for a grant the caller didn't create returns 403.
  - [ ] 6.4 Manually walk through the full account-deletion cascade in a test environment: sign up, create folders, upload files, share a file, then delete the account; confirm that the `workspaces`, `folders`, `attachments` (Storage + DB), and `shares` rows are all gone.
  - [ ] 6.5 Manually test the folder-delete edge case: create a folder, add two files, delete the folder, confirm both files still appear in the top-level file list with `folder_id = NULL`.
  - [ ] 6.6 Confirm the Google OAuth path works in every configured environment (local, staging, production) — wrong redirect URIs are a silent failure (R7).
  - [ ] 6.7 Run `npm test` and confirm all tests pass with no failures before marking this task complete.