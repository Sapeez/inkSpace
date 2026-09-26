# AGENTS.md

Brand You is a web app for viewing documents, annotating on a canvas, applying burn-in stamps, and managing permissioned file attachments.

## Commands

- `npm run dev` — runs the client (Vite) and server (Express) together in watch mode
- `npm test` — runs Node's built-in test runner (`node --test` against `tests/**/*.test.js`) — do not add Jest, Vitest, or Mocha
- `npm run typecheck` — runs `tsc --noEmit` against `src/`, `server/`, `tests/`
- `npm run supabase:migrate` — pushes the schema in `supabase/migrations/` via the Supabase CLI (`supabase db push`)

## Workflow

- [spec.md](spec.md) is the living spec for the PDF Editor feature (goal, expected behavior, permissions, edge cases, acceptance criteria), derived from `pdf_editor_prd.pdf` and `tasks/tasks-pdf-editor.md`. After completing any sub-task in that task list, update `spec.md` if the implementation changed or clarified agreed behavior — before moving to the next sub-task, not in a later cleanup pass.
- Per-sub-task loop for `tasks/tasks-pdf-editor.md` (see its "Instructions for Completing Tasks"): implement → update `spec.md` if needed → add tests via `agents/skills/testing.md`/`agents/skills/integration-testing.md` and run them → run the `code-reviewer` skill and report its findings → check off the sub-task. Don't check off a sub-task before this loop completes.
- For new features, follow the PRD → task-list process in [agents/rules/createprd.md](agents/rules/createprd.md) and [agents/rules/generatetasks.md](agents/rules/generatetasks.md).
- Branching and commit conventions: [agents/rules/git-workflow.md](agents/rules/git-workflow.md).
- New code is TypeScript: [agents/rules/typescript-standard.md](agents/rules/typescript-standard.md).
- Before merging, review changes against [agents/rules/code-review.md](agents/rules/code-review.md) — see [agents/skills/code-review.md](agents/skills/code-review.md) for the review process.

## More detail

- [Testing conventions](agents/skills/testing.md)
- [Database & Supabase](agents/skills/database.md)
- [Deployment](agents/skills/deployment.md)
- [Code review](agents/skills/code-review.md)

Claude Code users: see `CLAUDE.md` for the subagents, slash commands, and skills built on top of the files above.
