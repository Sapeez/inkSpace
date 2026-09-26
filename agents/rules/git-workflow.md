# Rule: Git Workflow for inkSpace

This repo doesn't have a standalone git-workflow rule yet — commit hygiene is implied by `code-review.md` §4.10. This file makes it explicit so there's one place to point at.

## Branching

- **No feature branches.** This repo works directly on `main` — every sub-task is implemented and committed straight onto `main`. Skip task `0.0 Create feature branch` from `agents/rules/generatetasks.md` when generating task lists for this repo, and strike it from any existing task list that still has it.
- Committing locally and pushing are different events: commit as each sub-task completes; pushing to `origin/main` only happens after the parent-task gate below clears.

## Commits

- Format: `<type>: <short description>`, types `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`. Body optional — use it to name the requirement ID(s) touched (`WF4`, `S7`, `P2`) so the commit is greppable against the task list.
- One commit per sub-task (or a small cluster of tightly related sub-tasks) — never one giant commit per parent task. Small commits keep `git diff` reviewable and make `code-review.md`'s "map the diff to requirement IDs" step (§1.3) actually tractable.
- Check off the corresponding `- [ ]` → `- [x]` in the task file in the **same commit** as the sub-task it completes, not in a separate batch commit at the end (`code-review.md` §4.10; `generatetasks.md`). Implementing a sub-task without checking it off, or checking off a parent task with unfinished sub-tasks, is a review finding.

## Parent-task gate (before pushing)

With no branch/PR boundary, this is the review checkpoint that replaces one. Work through sub-tasks one at a time, committing locally as each completes. Once every sub-task under a parent task (`1.0`, `2.0`, ...) is done and committed:

1. Stop and tell the user the parent task is complete. Do not push yet.
2. `npm run typecheck` then `npm test` — both green. Show the actual output.
3. Run a lint check.
4. Run the `code-reviewer` subagent (or `/code-review`) against the accumulated diff for that parent task.
5. If the diff touches `server/middleware/permissions.js`, sharing/grants, or any account/folder delete path, also run the `security-reviewer` subagent (or `/security-review`).
6. Write/run the relevant integration tests (`agents/rules/integration-tests.md`) for the feature area just completed.
7. Report requirement IDs covered, whether a new migration needs `npm run supabase:migrate`, and any new env var added to `.env.example`.
8. Wait for the user's explicit go-ahead. Only then run `git push`.

## What this file does not cover

Severity of findings, the specific non-negotiables (auth, cascading deletes, upload safety, burn-in), and the review template itself all live in `agents/rules/code-review.md` — this file is git mechanics only.
