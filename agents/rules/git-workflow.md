# Rule: Git Workflow for inkSpace

This repo doesn't have a standalone git-workflow rule yet — commit hygiene is implied by `code-review.md` §4.10. This file makes it explicit so there's one place to point at.

## Branching

- **No feature branches.** This repo works directly on `main` — every sub-task is implemented and committed straight onto `main`. Skip task `0.0 Create feature branch` from `agents/rules/generatetasks.md` when generating task lists for this repo, and strike it from any existing task list that still has it.
- **Commits are manual.** The assistant never runs `git commit` (or `git push`) itself. After finishing a sub-task, the assistant stops and reports it's done; once checks pass, it hands the user a single one-line commit message and the user runs the commit themselves.

## Commits

- Format: `<type>: <short description>`, types `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`. Body optional — use it to name the requirement ID(s) touched (`WF4`, `S7`, `P2`) so the commit is greppable against the task list.
- One commit per sub-task (or a small cluster of tightly related sub-tasks) — never one giant commit per parent task. Small commits keep `git diff` reviewable and make `code-review.md`'s "map the diff to requirement IDs" step (§1.3) actually tractable.
- Check off the corresponding `- [ ]` → `- [x]` in the task file as part of the same change set as the sub-task it completes, not in a separate batch at the end (`code-review.md` §4.10; `generatetasks.md`). Implementing a sub-task without checking it off, or checking off a parent task with unfinished sub-tasks, is a review finding.

## Parent-task gate (before pushing)

With no branch/PR boundary, this is the review checkpoint that replaces one. Work through sub-tasks one at a time; the user commits each one manually per the rule above. Once every sub-task under a parent task (`1.0`, `2.0`, ...) is done and committed:

1. Stop and tell the user the parent task is complete. Do not push.
2. `npm run typecheck` then `npm test` — both green. Show the actual output.
3. Run a lint check.
4. Run the `code-reviewer` subagent (or `/code-review`) against the accumulated diff for that parent task.
5. If the diff touches `server/middleware/permissions.js`, sharing/grants, or any account/folder delete path, also run the `security-reviewer` subagent (or `/security-review`).
6. Write/run the relevant integration tests (`agents/rules/integration-tests.md`) for the feature area just completed.
7. Report requirement IDs covered, whether a new migration needs `npm run supabase:migrate`, and any new env var added to `.env.example`.
8. Wait for the user's explicit go-ahead. Pushing is the user's call, not something the assistant runs on its own.

## What this file does not cover

Severity of findings, the specific non-negotiables (auth, cascading deletes, upload safety, burn-in), and the review template itself all live in `agents/rules/code-review.md` — this file is git mechanics only.
