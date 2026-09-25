---
description: Create or verify a lightweight checkpoint while working through a task list.
argument-hint: create <name> | verify <name> | list
---

Handle a checkpoint for inkSpace's task-list-driven workflow: $ARGUMENTS

**create `<name>`**: run `npm test` (and `npm run typecheck` once it exists) to confirm the current state is clean, then record `$(date -u +%Y-%m-%dT%H:%M:%SZ) | <name> | $(git rev-parse --short HEAD)` by appending to `.claude/checkpoints.log` (create the file if missing — it's local scratch, not something to commit unless the user asks).

**verify `<name>`**: read the checkpoint's commit SHA from the log, then report `git diff --stat <sha>...HEAD` (files changed since) and whether `npm test` still passes now vs. what's recorded.

**list**: print every line in `.claude/checkpoints.log`.

This is a lightweight local aid, not a replacement for the commit hygiene in `agents/rules/git-workflow.md` — a checkpoint is not a substitute for checking off `- [ ]` → `- [x]` in the task file as sub-tasks complete.
