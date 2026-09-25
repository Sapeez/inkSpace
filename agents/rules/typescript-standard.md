# Rule: TypeScript Standard for inkSpace

Companion to — not a replacement for — the files already governing this repo:

| File | Covers |
|---|---|
| `AGENTS.md` | Commands, workflow entry points |
| `agents/rules/createprd.md` | How a PRD gets written |
| `agents/rules/generatetasks.md` | How a PRD becomes a task list |
| `agents/rules/code-review.md` | Review checklist, severity levels, non-negotiables |
| `agents/rules/integration-tests.md` | Playwright/browser-driven test rules |
| `agents/skills/*.md` | Testing, database, deployment quick references |
| `claude/accounts-workspace-prd.md` (project doc) | Accounts, login, workspace requirements |

This file does not restate the security/authorization non-negotiables in `code-review.md` §4 — that file is the source of truth for those. What's here is a TypeScript standard for a codebase that is currently JS/JSX.

---

## 1. Where this repo stands today

- **Frontend:** React 19 + Vite + React Router, written in **JSX, not TSX**.
- **Backend:** Node.js + Express, plain `.js`.
- **Database:** Supabase (Postgres + Storage + Auth).
- **Test runner:** Node's built-in `node --test` only — no Jest/Vitest/Mocha (`AGENTS.md`, `agents/skills/testing.md`). Playwright for browser specs under `tests/integration/**`.
- **The one place TypeScript already exists:** `tests/consts/*.ts` (`inkSpace.ts`, `routes.ts`).
- **`tsconfig.json` exists at the repo root** (baseline below), added ahead of the first real `.ts`/`.tsx` source file so the standard is in place from the start.

**Premise:** new code — and the accounts/workspace feature in particular — should be written in TypeScript, since that PRD is the next major slice of work and is a clean place to start the migration rather than adding more untyped JS on top of an already-large surface (auth, permissions, cascading deletes) where type errors are expensive. §7 has the phased migration plan for the rest of the app.

---

## 2. The TypeScript standard

### 2.1 Scope

- Every **new file** in `src/`, `server/`, and `tests/` is TypeScript (`.ts`/`.tsx`), not `.js`/`.jsx`.
- Every file you **touch substantially** (not a one-line fix) is a candidate for conversion in the same PR — don't let a drive-by conversion balloon a small PR's diff. Convert opportunistically, except for the accounts/workspace feature (2.2) where it's the standard from day one.
- The accounts/workspace feature is built **entirely in TypeScript**: new routes, new `src/lib` wrappers, new server routes/middleware, and the `workspaces`/`folders` schema types.

### 2.2 Baseline `tsconfig.json`

Already in place at the repo root (`allowJs`/`checkJs: false` lets JS and TS coexist during the migration without forcing every legacy file to typecheck on day one). `strict: true` is non-negotiable — this repo has an explicit "no silent failures" pattern (`code-review.md` §3 Correctness: null/undefined handling on every code path touching Supabase responses), and `strict` plus `noUncheckedIndexedAccess` is what makes that a compiler-enforced rule instead of a review-time hope.

Run `npm run typecheck` (→ `tsc --noEmit`) as its own step; Vite (via esbuild) transpiles/bundles but does not type-check, so this must run separately in CI and before any PR.

### 2.3 Directory-by-directory conventions

| Directory | Today | TS standard going forward |
|---|---|---|
| `src/lib/` (`fetch.js`, `http.js`, `create.js`, `change.js`, `remove.js`, `index.js`) | Untyped API wrappers | Highest-value conversion target (§2.8) — every wrapper gets a typed request/response shape. Start here (§7). |
| `src/routes/` (`App.jsx`, `HomePage.jsx`) | JSX | New auth/workspace routes (`LoginPage`, `SignupPage`, `WorkspacePage`, etc.) are `.tsx` from the start. |
| `src/modals/` | JSX | New modals (`DeleteAccountModal`, `DeleteFolderModal`) are `.tsx`; confirmation-copy strings are typed literal unions or constants, not inline strings. |
| `src/toolbar/`, `src/viewer/`, `src/annotation-canvas/` | JSX | Leave as JSX unless directly touched — real runtime canvas/PDF behavior; convert deliberately with visual regression coverage, not opportunistically. |
| `server/routes/` (`attachments.js`, `burn-in.js`) | JS | New routes (`folders.ts`, `grants.ts`, `workspaces.ts`) are TS with typed `Request`/`Response` (§2.6). |
| `server/middleware/` (`permissions.js`) | JS | **Priority conversion.** The authorization chokepoint — typing `req.user` here (§2.6) removes an entire class of "identity read from the wrong place" bugs at compile time. |
| `server/services/` (`burn-in.js`, `storage.js`) | JS | Convert alongside any new workspace/folder/grants service. |
| `supabase/migrations/` | SQL | Not TS, but every migration that changes a table used by application code must be followed by regenerating types (§2.7) in the same PR. |

### 2.4 Type safety rules

- **No `any`.** Use `unknown` at boundaries (a Supabase response, an incoming request body, a webhook payload) and narrow explicitly. An `any` introduced to silence a type error deletes exactly the check `strict` mode exists to provide.
- **Supabase responses are never assumed populated.** `code-review.md` §3 already requires checking `error` before touching `data`; in TS this becomes a discriminated result type:
  ```ts
  type Result<T> = { data: T; error: null } | { data: null; error: PostgrestError };
  ```
- **Validate at the boundary.** Any request body / query param the server trusts (folder name, share-grant email, filename) is parsed through a schema validator (e.g. `zod`) at the route handler — a TS type is erased at runtime and doesn't protect against a malformed request.
- **No `req.body.userId`.** `code-review.md` §4.2 already forbids trusting client-supplied identity; in TS, don't even give the request-body type a `userId` field — every handler reads identity off `req.user` (populated by `requireAuth`) and nothing else.
- **Discriminated unions over boolean flags** for anything with more than two states (a share's `edit | view` level — a literal union, not `canEdit`/`canView` booleans that can disagree).
- **Exact modal/toast copy as typed constants** — `const COPY = { deleteAccountTitle: '...' } as const`, greppable and shared between the component and its test.

### 2.5 Naming & style

- `camelCase` for variables/functions, `PascalCase` for components/types/interfaces, `UPPER_SNAKE_CASE` for true constants (matching the existing `MAX_UPLOAD_BYTES` pattern).
- `interface` for object shapes that might be extended (props, API resources); `type` for unions, tuples, mapped types.
- One exported component/function per file where practical, file name matches the export.
- No default exports except top-level route/page components — named exports keep "find usages" reliable.

### 2.6 React + Express + TypeScript specifics

- Type props explicitly; no `// @ts-expect-error` to work around an implicit-`any` prop.
- Hooks wrapping workspace/auth state (`useWorkspace`, `useAuth`) get an explicit return type, so a missing-refresh bug is a type error at the call site, not a runtime desync.
- Event handlers use the specific React event type (`React.ChangeEvent<HTMLInputElement>`), never `any`/bare `Event`.
- Express handlers type request/response with real shapes, not bare `Request`/`Response`:
  ```ts
  import type { Request, Response } from 'express';

  interface AuthedRequest extends Request {
    user: { id: string; email: string; emailVerified: boolean };
  }

  router.delete('/folders/:id', requireAuth, async (req: AuthedRequest, res: Response) => {
    // req.user is typed; a handler reading req.body.userId won't compile.
  });
  ```
- `requireAuth` is the one place that produces `req.user` — this makes "identity comes only from the verified token" a type-level guarantee for every downstream handler, not just a review-time check.
- Return typed error shapes consistently (`{ error: string; code?: string }`) so `src/lib` wrappers can discriminate without parsing free-form strings.

### 2.7 Supabase + TypeScript

- Generate types after every migration: `supabase gen types typescript --local > src/lib/database.types.ts`. Commit the generated file so both `src/` and `server/` import the same source of truth.
- Both sides import the generated `Database` type into a typed Supabase client (`createClient<Database>(...)`).
- Never hand-maintain a parallel `interface Attachment { ... }` — derive it (`type Attachment = Database['public']['Tables']['attachments']['Row']`) so a schema change surfaces as a compile error everywhere it's used.

---

## 3. Testing in TypeScript

### 3.1 Running `.ts` tests under `node --test`

The `node --test`-only rule is independent of language. Node 20 (the `engines` floor) does not execute `.ts` natively. Two compliant options, in order of preference:

1. **Upgrade the engine floor to Node 22.6+** and use `--experimental-strip-types` (stable, no separate transpile step, still `node --test` under the hood).
2. On Node 20, use `tsx`'s test-runner integration (`node --import tsx --test`) — a loader, not a competing framework, so it does **not** violate the rule the way Jest/Vitest would.

Do **not** reach for `ts-jest` or a Jest/Vitest TS preset — that reintroduces exactly the framework this repo forbids, via the TS door instead of the JS one.

### 3.2 Playwright specs

`agents/rules/integration-tests.md` already governs this in full and doesn't change by writing new specs in `.ts` — Playwright's runner handles TS out of the box.

### 3.3 Type-check as its own step

`tsc --noEmit` (via `npm run typecheck`) catches nothing at runtime and nothing in `npm test` — run it as a separate step before `npm test`, in CI and before any PR. A green test suite with type errors is not a passing build.

---

## 4. Repo non-negotiables — pointer, not a copy

`agents/rules/code-review.md` §4 is authoritative (auth via Supabase only, ownership checks on every mutating endpoint, cascading deletes real and ordered, burn-in server-side, uploaded images re-encoded, UTC timestamps, the 255-char filename boundary, no client-trusted identity, scope discipline against each PRD's Out-of-Scope section). TypeScript changes *how* several of these are enforced (identity typing in §2.6, result-shape typing in §2.4) but never *what* is required. Where this file and `code-review.md` disagree, `code-review.md` wins.

---

## 5. Migration checklist: JS/JSX → TypeScript

Ordered by leverage (highest-risk / most-reused code first), not by ease:

1. **`server/middleware/permissions.js` → `.ts`** — the authorization chokepoint.
2. **`src/lib/*.js` → `.ts`** — the API wrapper layer every page and modal calls through.
3. **`server/routes/*.js` and `server/services/*.js` → `.ts`** — pairs naturally with adding the new folders/grants/workspaces routes in TS from the start.
4. **New accounts/workspace UI (`src/routes`, `src/modals` additions) → `.tsx` from creation** — no legacy code to convert.
5. **`src/annotation-canvas`, `src/toolbar`, `src/viewer` → `.tsx`** — last, deliberately, and only with visual-regression coverage in place first, since a type-only refactor of rendering-behavior-sensitive code is easy to get subtly wrong.

At each step: run `npm run typecheck`, fix what surfaces, and do not silence errors with `any` — an error `tsc` finds during a mechanical conversion is very likely a real latent bug (an unchecked Supabase `error`, a `req.body` field nothing validates), not a false positive.

---

## 6. Quick reference

- New code: TypeScript, `strict: true`, no `any`.
- Identity: only from `req.user` via `requireAuth` — enforced via the `AuthedRequest` type (§2.6), not just review.
- Supabase: typed client against generated types (§2.7), always check `error` before `data`.
- Tests: `node --test` only — TS via `--experimental-strip-types` (Node 22.6+) or `tsx`, never Jest/Vitest/Mocha.
- Copy (modals/toasts): typed constants, not inline strings.
- Before "done": `npm run typecheck` → `npm test` → the relevant check from `CLAUDE.md`'s verification table → a fresh-context review pass (`code-reviewer` / `security-reviewer` subagents) for anything touching auth, permissions, or cascading deletes.
