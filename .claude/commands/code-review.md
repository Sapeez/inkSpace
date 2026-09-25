---
description: Review uncommitted changes (or the given files/PR) against agents/rules/code-review.md.
---

Invoke the `code-reviewer` subagent to review $ARGUMENTS (default: the current uncommitted diff, `git diff HEAD`).

The subagent reads `agents/rules/code-review.md` and `agents/skills/code-review.md` in full, maps the diff to requirement IDs in `tasks/tasks-pdf-editor.md` / `tasks/tasks-accounts-workspace.md` where applicable, and delegates to the `security-reviewer` subagent for anything touching auth, permissions, uploads, or cascading deletes. Report findings grouped CRITICAL → HIGH → MEDIUM → LOW per the template in `code-review.md` §5.
