@AGENTS.md

## Claude Code tooling in this repo

`AGENTS.md` above is the canonical entry point — commands, workflow, and links to the rule/skill files under `agents/`. Everything below is Claude-Code-specific plumbing that sits on top of it; none of it duplicates a rule that already lives in `agents/rules/` or `agents/skills/`.

- **Subagents** (`.claude/agents/*.md`) — invoke with the Task tool, or let Claude pick one when its description matches:
  - `security-reviewer` — auth/authz/cascading-delete/upload-safety review against `agents/rules/code-review.md` §4.2–§4.5. Run this on any diff touching `server/middleware/permissions.js`, sharing/grants, or account/folder deletion, before opening a PR.
  - `code-reviewer` — runs the full `agents/rules/code-review.md` + `agents/skills/code-review.md` process end to end.
  - `tdd-guide` — enforces red/green/refactor with **`node --test` only** (never Jest/Vitest/Mocha).
  - `e2e-runner` — writes and runs Playwright specs per `agents/rules/integration-tests.md`.
  - `build-error-resolver` — fixes `tsc`/Vite build errors with minimal diffs, never by adding `any`.
- **Commands** (`.claude/commands/*.md`) — `/code-review`, `/security-review`, `/tdd`, `/e2e`, `/build-fix`, `/verify`, `/create-prd`, `/generate-tasks`, `/checkpoint`.
- **Skills** (`.claude/skills/*/SKILL.md`, auto-invoked by description) — `code-review`, `generate-tasks`, `create-prd` (mirrors the `.cursor/skills/` equivalents so Claude Code auto-invokes them too, plus a `create-prd` one that `.cursor/skills/` doesn't have yet), plus `frontend-patterns`, `backend-patterns`, and `verification-loop`, which are new and specific to this codebase.
- **TypeScript standard** — [agents/rules/typescript-standard.md](agents/rules/typescript-standard.md). New code in `src/`, `server/`, and `tests/` is TypeScript; the accounts/workspace feature is TS from day one.
- **Git workflow** — [agents/rules/git-workflow.md](agents/rules/git-workflow.md).
- **Hooks** (`.claude/settings.json`) — after an edit under `src/` or `server/`, `tsc --noEmit` runs automatically and surfaces new type errors inline. A second hook blocks edits to already-committed files under `supabase/migrations/` (migrations are additive — add a new one instead) and reminds you to regenerate Supabase types.

## Quick reference — verification commands

| Change type | Run before calling it done |
|---|---|
| Any TS/JS change | `npm run typecheck` then `npm test` |
| `permissions.js`, folders, grants | `npm test` + a targeted check of the specific IDOR case (user B hitting a route on user A's resource must return `403`) |
| Folder or account deletion | A test asserting the *opposite* of the naive bug (folder delete leaves attachments with `folder_id = NULL`; account delete cascades in the documented order) |
| Workspace/viewer UI | Screenshot check against the relevant PRD's design requirements |
| Migration files | `npm run supabase:migrate`, then regenerate Supabase types, then confirm the app still typechecks |

Show the actual command output rather than asserting "done" — that's what a returning reviewer (human or the next session) checks first.
