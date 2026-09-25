# AGENTS.md

Brand You is a web app for viewing documents, annotating on a canvas, applying burn-in stamps, and managing permissioned file attachments.

## Commands

- `npm run dev` — runs the client (Vite) and server (Express) together in watch mode
- `npm test` — runs Node's built-in test runner (`node --test` against `tests/**/*.test.js`) — do not add Jest, Vitest, or Mocha
- `npm run typecheck` — runs `tsc --noEmit` against `src/`, `server/`, `tests/`
- `npm run supabase:migrate` — pushes the schema in `supabase/migrations/` via the Supabase CLI (`supabase db push`)

## Workflow

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
