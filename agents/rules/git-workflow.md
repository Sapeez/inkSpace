# Rule: Git Workflow for inkSpace

This repo doesn't have a standalone git-workflow rule yet — branching is implied by `agents/rules/generatetasks.md`'s task `0.0 Create feature branch`, and commit hygiene is implied by `code-review.md` §4.10. This file makes both explicit so there's one place to point at.

## Branching

- Every feature/task list starts with task `0.0` from `agents/rules/generatetasks.md`: create and check out `feature/[feature-name]` before touching any other task.
- Branch names are kebab-case and match the task-list filename's feature slug (`tasks-accounts-workspace.md` → `feature/accounts-workspace`, or a narrower `feature/accounts-workspace-folders` for a sub-slice).
- Never commit directly to `main`.

## Commits

- Format: `<type>: <short description>`, types `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`. Body optional — use it to name the requirement ID(s) touched (`WF4`, `S7`, `P2`) so the commit is greppable against the task list.
- Small, focused commits over one giant commit per parent task — a commit per sub-task (or a small cluster of related sub-tasks) makes `git diff [base]...HEAD` reviewable and makes `code-review.md`'s "map the diff to requirement IDs" step (§1.3) actually tractable.
- Check off the corresponding `- [ ]` → `- [x]` in the task file in the **same commit** as the sub-task it completes, not in a separate batch commit at the end (`code-review.md` §4.10; `generatetasks.md`). A PR that implements a sub-task without checking it off, or checks off a parent task with unfinished sub-tasks, is a review finding.

## Before opening a PR

1. `npm run typecheck` (once added per `agents/rules/typescript-standard.md`) then `npm test` — both green.
2. If the diff touches `tests/integration/**`, confirm it satisfies `agents/rules/integration-tests.md` in full.
3. Run the `code-reviewer` subagent (or `/code-review`) against the diff before asking a human to review it — catch what the implementing session is too close to see.
4. If the diff touches `server/middleware/permissions.js`, sharing/grants, or any account/folder delete path, also run the `security-reviewer` subagent (or `/security-review`).
5. Note in the PR description: requirement IDs covered, whether a new migration needs `npm run supabase:migrate`, and any new env var added to `.env.example`.

## PR description

- Summarize *why*, not just *what* — the PRD/requirement IDs this PR advances.
- Include a test plan: which of `npm test`, the targeted Playwright specs, and manual verification (per `CLAUDE.md`'s verification table) were run.
- Draft from the full commit history on the branch (`git log`, `git diff main...HEAD`), not just the latest commit.

## What this file does not cover

Severity of findings, the specific non-negotiables (auth, cascading deletes, upload safety, burn-in), and the review template itself all live in `agents/rules/code-review.md` — this file is git mechanics only.
