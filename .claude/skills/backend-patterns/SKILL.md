---
name: backend-patterns
description: Express + Supabase conventions for inkSpace's server/ backend — routing, middleware, services, and identity. Use when adding or modifying anything under server/, or a Supabase migration.
---

# Backend Patterns — inkSpace

This repo's actual `server/` conventions. Read `agents/skills/database.md` for the current schema and `agents/rules/typescript-standard.md` §2.6 before converting any of this to TypeScript.

## Directory roles

| Directory | Role |
|---|---|
| `server/index.js` | Express app bootstrap: CORS, JSON body parsing (1mb limit), route mounting, and the single centralized error handler at the bottom (`app.use((err, req, res, next) => ...)`). New routers get mounted here, errors still flow to that one handler — don't add a second one. |
| `server/routes/` | One router file per resource (`attachments.js`, `burn-in.js`; add `folders.js`, `grants.js`, `workspaces.js` as the accounts-workspace feature lands). Routes call into `middleware/` for auth/permission checks and `services/` for the actual work — a route handler should be thin. |
| `server/middleware/` | `permissions.js` is the authorization chokepoint — `requirePermission(checkFn)` wraps a route, reads `x-user-id` (today's placeholder identity mechanism; becomes `requireAuth` reading a verified Supabase JWT once accounts land), and returns `401`/`403` before the handler runs. |
| `server/services/` | The actual business logic (`storage.js`, `burn-in.js`) — Supabase calls, `pdf-lib` burn-in, file I/O. Routes should not call Supabase directly; go through a service. |

## The authorization pattern

Every mutating route wraps itself in a permission check *before* touching data — never inline the check in the handler body:

```js
router.delete('/:id', requirePermission(canWrite), async (req, res, next) => {
  // req.userId is already verified and set by requirePermission at this point
});
```

`canRead`/`canWrite`/`canBurnIn` in `permissions.js` are stubs today (`return true`) with a `TODO: query supabase permissions table` — per `agents/skills/database.md`, the real table to query is **`shares`**, not the superseded `permissions` table. When implementing these for real: query `shares` by `attachment_id` + the caller's user id/email, check the `role` column (`edit`/`view`) against what the route needs, and return `403` (via `requirePermission`'s existing shape) on failure — don't invent a second permission model.

Once `requireAuth` replaces the `x-user-id` header (accounts-workspace Phase 1), identity moves from `req.headers['x-user-id']` to `req.user` populated from a verified Supabase JWT — per `code-review.md` §4.2, no handler may read identity from anywhere else afterward. This is the conversion this repo's TS standard specifically calls out as priority #1 (`agents/rules/typescript-standard.md` §2.3/§5) — typing `req.user` via an `AuthedRequest` interface makes "identity from the verified token only" a compile-time guarantee, not just a review checklist item.

## Supabase access

- Server code uses the **service role key** (`SUPABASE_SERVICE_ROLE_KEY`) — never expose it to the browser, a response body, or a log line reachable from the frontend (`code-review.md` §4.2).
- Client code (`src/`) uses only the **anon key**. If you're writing a `server/` file and reaching for `VITE_*` env vars, stop — that prefix is client-only by Vite convention and a service-role operation should never be gated behind it.
- Always check `error` before trusting `data` on a Supabase response (`code-review.md` §3 Correctness) — this becomes a discriminated `Result<T>` type once the file is TypeScript (`agents/rules/typescript-standard.md` §2.4).
- Schema changes go in a **new** file under `supabase/migrations/` (never edit an already-applied migration in place — the repo's hook in `.claude/settings.json` blocks this) and are applied with `npm run supabase:migrate`. Regenerate types afterward: `supabase gen types typescript --local > src/lib/database.types.ts`.

## Error handling

Route handlers pass errors to `next(err)` rather than responding directly on failure — the centralized handler in `server/index.js` formats the response (`{ message }`, defaulting to 500). Don't add a per-route try/catch that swallows an error instead of forwarding it; do add one where you need to translate a lower-level error (e.g. a Supabase error) into a meaningful `err.status`/`err.message` before forwarding.

## Destructive & cascading operations

Any endpoint that deletes something checks `code-review.md` §4.4 before being written: folder delete must `UPDATE attachments SET folder_id = NULL` and never touch the attachment rows or Storage objects; account delete must cascade in the documented order (shares/grants → attachments → folders → workspace → `auth.users`) inside a real transaction/ordered sequence, not a soft-delete flag.

## Upload & burn-in

- Validate uploaded file type/size server-side even where a client-side check exists (`code-review.md` §4.5) — the client check is UX only.
- Re-encode uploaded images server-side before storing/serving them; never persist or serve the raw uploaded bytes.
- Burn-in runs in `server/services/burn-in.js` via `pdf-lib` — it is never acceptable to treat a client-side canvas flatten as "burned" (`code-review.md` §4.6).
