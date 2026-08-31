# Rule: Reviewing Code for Brand You

These rules govern every code review performed on this repo — PRs, diffs, or ad-hoc "review this" requests. Read and apply every rule below. When a rule here conflicts with a general/generic review instinct, this file takes precedence, because it reflects decisions already made in the PRDs and task lists under `/tasks/`.

Stack: React 19 + Vite (frontend, JSX not TSX), Node.js + Express (backend), Supabase — Postgres + Storage + Auth. Test runner is Node's built-in `node --test` (`npm test`). Playwright is used only for browser-driven specs under `tests/integration/**`, governed separately by [agents/rules/integration-tests.md](integration-tests.md).

---

## 1. Review Workflow

1. Run `git diff` (or read the stated diff/PR/files) to scope the review. Read changed lines plus enough surrounding context to understand intent.
2. Classify each changed file: application code (`src/`, `server/`), test file (`tests/`), migration (`supabase/migrations/`), config (`.env.example`, `package.json`, `vite.config.js`), or docs/task files (`/tasks/*.md`, `agents/**`).
3. If the change touches an in-flight feature, open the matching task file (`tasks/tasks-pdf-editor.md` or `tasks/tasks-accounts-workspace.md`) and find the requirement IDs referenced in the relevant sub-task (e.g. `WF4`, `A6`, `S7`, `P2`, `R4`). Treat those IDs as the acceptance criteria — a change that satisfies "looks right" but drifts from the literal requirement (exact modal copy, exact toolbar order, exact status code) is a finding, not a nitpick.
4. Identify risk level from change type. Highest risk in this codebase: anything touching `requireAuth`/`permissions.js` (authz), anything touching Supabase Storage/service-role usage, anything that deletes or cascades data (accounts, folders, shares), and burn-in/annotation persistence (`server/services/burn-in.js`).
5. Apply the Universal Checklist (§3) and the Project Non-Negotiables (§4) to every relevant file. Apply [agents/rules/integration-tests.md](integration-tests.md) in full to any file under `tests/integration/**`.

## 2. Severity Classification

**🚨 CRITICAL** — Authorization bypass (IDOR: mutating or reading another user's folder/file/grant), a permission check that exists only client-side, secrets (Supabase service role key, Google OAuth client secret) reachable from browser code or committed to the repo, custom auth/crypto replacing Supabase Auth, a destructive operation (account delete, folder delete) that deletes the wrong thing or in the wrong order, client-side-only burn-in, raw (non-re-encoded) uploaded files served back to users, and any change that reintroduces a feature from a PRD's "Out of Scope" list.

**⚠️ HIGH** — Logic errors in core flows (filename/timestamp generation, save/burn-in pipeline, share revocation), missing server-side validation on an endpoint that has client-side validation, race conditions in save-in-flight UI state, off-by-one errors on stated boundaries (255 vs 256 chars, etc.), missing ownership/role check that isn't a full IDOR but weakens it, N+1 Supabase queries or missing pagination on file/grant lists, error handling that leaves an "in-flight" UI stuck (no way to recover from a failed save).

**💡 MEDIUM** — Deviation from the exact requirement wording in a task file (button label, empty-state copy, toast text) that isn't user-facing-security-relevant, code duplication across `src/lib/*` API wrappers, missing empty-state handling, incomplete error messages, state not kept in sync after a mutation without a full reload (violates the `useWorkspace`/`useAuth` hook contract implied by the task lists).

**ℹ️ LOW** — Style inconsistencies, naming clarity, minor comment additions to test files (test code must have **no** comments per integration-tests.md §17 — flag any comment added there, even trivial ones), stale references to the old `inkSpace` project name outside of already-generated `tests/consts/inkSpace.ts` (this file's *name* is legacy scaffolding, not a bug — only flag *new* inkSpace references being introduced elsewhere).

## 3. Universal Checklist

**Security**: No secrets or API keys in code — env vars only (`.env.example` lists the contract). All input handling checked for injection (SQL via Supabase client parameterization, path traversal on filenames, XSS in any user-supplied text rendered without escaping). Authentication checks exist on every route that needs them; authorization checks validate *ownership*, not just "is logged in." Review any new use of `dangerouslySetInnerHTML` or raw HTML injection.

**Correctness**: Null/undefined handling on every code path touching Supabase responses (`data`, `error` — Supabase client returns both, never assume `data` is populated without checking `error` first). Boundary conditions: empty file lists, zero folders, max filename length, zero shares. Error paths surface a user-visible message (per this project's "never a silent failure" pattern — see SU1/LG1/EV1 in the accounts-workspace task list) rather than swallowing the error. Loops/pagination over Supabase results terminate and don't assume unbounded result sets.

**Performance**: No O(n²) client-side filtering on file lists (search bar in `SearchBar.jsx` filters client-side by design — only flag this if the list is unbounded/unpaginated at the data layer). PDF rendering must stay virtualized/progressive per Risk R2 in the PDF editor PRD — flag any change that forces full-document render up front. Resource cleanup: object URLs, Fabric/Konva canvas instances, and Supabase Storage signed-URL fetches must be released/aborted on unmount.

**Maintainability**: Naming reveals intent without comments. Coupling stays localized — a change to one route file shouldn't ripple into unrelated ones. Magic numbers (`255`, `4pt` stroke width, `10` recent files) should trace back to a named constant or a cited requirement ID in a comment, not float unexplained. Error messages include enough context to debug (which attachment ID, which user role).

## 4. Project Non-Negotiables

These are decisions already made in the PRDs/task lists. A PR that violates one of these is a finding regardless of how clean the code otherwise is.

### 4.1 Tooling
- Test runner is `node --test` only. A PR that adds Jest, Vitest, Mocha, or a config file for any of them is a CRITICAL finding — reject it outright, this is an explicit repo rule (`AGENTS.md`, `agents/skills/testing.md`).
- No client-side dependency for PDF rendering other than `pdfjs-dist`, no annotation library other than Fabric.js *or* Konva.js — pick one and check the PR doesn't introduce both.
- `pdf-lib` is server-only (burn-in). It must never appear in `src/`.

### 4.2 Auth & Identity
- Supabase Auth handles password hashing, token issuance, and OAuth — a PR must never add custom password hashing, custom JWT signing, or a bespoke session store.
- Server code must never trust a client-supplied user ID (`req.body.userId`, a query param, etc.) for identity. Identity must always come from the verified token via `requireAuth` (`req.user`). Flag any handler that reads identity from anywhere else.
- Client code uses only `VITE_SUPABASE_ANON_KEY`. `SUPABASE_SERVICE_ROLE_KEY` must appear only in `server/` and must never be interpolated into a response body, a client bundle, or a log line reachable from the frontend.

### 4.3 Authorization
- Every mutating endpoint (`PATCH`, `DELETE`, `POST` that changes state) must verify the caller owns or has the right role on the resource before acting, and must return `403` (not `404`, not a silent no-op) when they don't. Cross-check this explicitly for folders, grants, workspace settings, shares, and attachments.
- UI-level hiding of a control (e.g. hiding the Save button for view-only users) is a UX nicety only. It is never sufficient by itself — the corresponding server endpoint must independently reject the action. If a PR adds a UI gate without a matching server check, that's CRITICAL, not MEDIUM.

### 4.4 Destructive & Cascading Operations
- Deleting a folder must set `folder_id = NULL` on its attachments, and must **never** delete the attachment rows or Storage objects. Treat any code path that deletes attachments as part of a folder-delete as CRITICAL (silent data loss).
- Account deletion must be a real, ordered cascading delete: shares/grants → attachments (Storage + DB) → folders → workspace row → `auth.users` row (via the Supabase admin API). A soft-delete flag, or deleting in an order that could leave orphaned Storage objects or dangling FKs, is CRITICAL.
- Any destructive action reachable from the UI must be gated by a confirmation modal whose copy matches what the task list specifies verbatim (e.g. delete-account and delete-annotation modals have exact required title/body text) — check this whenever a PR touches `DeleteAccountModal`, `DeleteFolderModal`, or `DeleteConfirmModal`.

### 4.5 File & Image Upload Safety
- Signature/image uploads must be validated for type and size on both the client (fast feedback) and the server (authoritative). A client-only check is a finding.
- Uploaded images must be re-encoded server-side before being stored/served — never store and serve the raw uploaded bytes. This exists specifically to stop a malicious file disguised with an image extension/MIME type (PDF editor PRD Risk R8) — treat a regression here as CRITICAL.
- PDF upload size limits must be enforced server-side even if a client-side limit exists; a client-only limit is bypassable and should be flagged as HIGH.

### 4.6 Burn-in & Annotations
- Burn-in must run server-side via `pdf-lib` (`server/services/burn-in.js` / `POST /api/attachments/:id/burn-in`). A client-side-only "burn-in" (e.g. flattening the canvas to an image in the browser and calling it done) is CRITICAL — it lets a view-only or malicious client fabricate a "burned" document without server enforcement, and defeats the point of burning annotations in server-controlled code.
- Annotation coordinates must be normalized to PDF point space, not pixel space tied to the current zoom/scroll — a coordinate system that drifts across zoom levels is a correctness bug tied directly to PRD Risk R1.

### 4.7 Filenames & Timestamps
- All timestamp generation (`generateDefaultFilename`, verification links, "recent files") must use UTC. A change that uses `Date` in local time for anything user-facing-but-persisted is a bug.
- Filename validation boundaries are exact: empty string and >255 chars are errors; exactly 255 is valid. Check off-by-one carefully — this is a named boundary case in the task list and the integration test rules.
- Re-saving a file whose name already ends in a generated timestamp must *replace* that timestamp, not append a second one.

### 4.8 In-Flight UI State
- Any async action with a visible progress state (Save modal) must disable the relevant controls (filename field, Cancel, close/X) *visibly* — a `disabled` prop change alone that isn't reflected in styling, or a functional-only guard that leaves the control looking clickable, is a finding, because the task list calls this out explicitly ("visibly, not just functionally").
- A completed save (success or failure) must leave the modal open — don't accept an auto-close "fix"; that's a requirement violation (S8), not a UX improvement.
- Toast copy for save success/failure must match the required template exactly, including the dynamic filename — check string construction isn't hardcoded to a placeholder.

### 4.9 Scope Discipline
- Before approving any new UI surface or endpoint, check it against the relevant PRD's "Out of Scope" section (referenced as §3.4 in both task lists). Anything reintroducing: multiple workspaces, workspace switching, 2FA, non-Google OAuth, public/anonymous sharing links, soft/reversible account deletion, print, in-app search, per-annotation styling, a notes/comment tool for editors, cover pages/stamps/callouts/redaction, non-PDF attachments, OCR, form-filling, real-time co-editing, cross-session undo, or page reorder/rotate — flag it as a scope violation, even if it's well implemented.

### 4.10 Task-List & PRD Hygiene
- If the diff includes changes to a `tasks/*.md` file, confirm checkboxes are being flipped incrementally (`- [ ]` → `- [x]`) per completed sub-task rather than in one batch at the end — this is an explicit process rule (`agents/rules/generatetasks.md`), not just tidiness.
- If a PR implements a sub-task but doesn't check it off, or checks off a parent task without every sub-task done, flag it.

### 4.11 Test Files
- Unit/API-integration tests (`tests/*.test.js`) must run under `node --test` — no test framework globals from Jest/Vitest/Mocha.
- Browser-driven specs under `tests/integration/**` must comply with every rule in [agents/rules/integration-tests.md](integration-tests.md) — imports from `tests/fixtures/testFixtures`, `TEST_IDS`/`TEXT_CONTENT`/`ITEM_FIELD_NAMES` constants only (no raw strings), `BasePage` helper methods only, no `page.waitForTimeout()` or `page.evaluate()` for interactions, assertions on actual resulting state (not just a surface UI effect), and **no comments in test code at all**. Treat any violation of that file as a finding here too — don't wave it through because "it's just a test."

## 5. Output Format

Group findings by severity, CRITICAL first. Within a severity, group related issues. Cite `path/to/file.ext:line` when you have real line numbers from the diff; cite the function/component name with a quoted snippet when you don't — never fabricate a line number. For each finding, state the concrete failure scenario (what input/state triggers it, what breaks), not just "this could be a problem." Prefer a specific fix ("check `req.user.id === folder.owner_id` before deleting") over a vague one ("add validation"). Call out good patterns worth keeping, especially where a PR correctly follows one of the non-negotiables above.

### Review Template

1. **Context Questions** (only if genuinely needed): 1–3 questions about intent, tied to a specific requirement ID if applicable.
2. **Findings**: grouped CRITICAL → HIGH → MEDIUM → LOW, each with file:line, the concrete failure scenario, and the rule or requirement ID it violates.
3. **Suggested Fixes**: short, specific, code-snippet-sized — not full rewrites unless asked.
4. **Deployment/Test Notes** (when applicable): does this need a new migration run (`npm run supabase:migrate`)? Does it need an env var added to `.env.example`? Does `npm test` need to be re-run before merge?
