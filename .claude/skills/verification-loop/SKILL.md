---
name: verification-loop
description: Never declare a change done without running this repo's actual verification commands and showing the output. Use before saying a task, sub-task, or PR is ready.
---

# Verification Loop

Before marking any task, sub-task, or PR done in inkSpace, run the check that matches what changed and show the actual output — not a description of what you expect it to show.

| Change type | Verification |
|---|---|
| Any TS/JS change | `npm run typecheck` (once added per `agents/rules/typescript-standard.md`) then `npm test` |
| `permissions.js`/`requireAuth`, folders, or grants | `npm test`, then a targeted check of the specific IDOR case — a second user's request against the first user's resource must return `403`, not `404` or a silent success |
| Folder or account deletion logic | A test asserting the *opposite* of the naive bug: folder delete leaves attachments with `folder_id = NULL`; account delete removes rows in the documented cascade order |
| UI changes to viewer/toolbar/workspace shell | A screenshot comparison against the relevant PRD's design requirements |
| Migration files | `npm run supabase:migrate` against a local/staging project, then `supabase gen types typescript`, then confirm the app still typechecks |
| A `tasks/*.md` change | Confirm checkboxes were flipped incrementally per completed sub-task, not batched at the end (`agents/rules/git-workflow.md`) |

## Why this matters here specifically

This repo's task lists (`tasks/tasks-pdf-editor.md`, `tasks/tasks-accounts-workspace.md`) tie every sub-task to a numbered requirement ID. "Looks right" is not the bar — `code-review.md` explicitly treats a plausible-looking implementation that drifts from the literal requirement (wrong status code, paraphrased modal copy, appended instead of replaced timestamp) as a finding. The only way to catch that before a reviewer does is to actually run the test or the specific check the requirement implies, not to read the diff and reason about what it probably does.

## Before saying "done"

1. Identify which row(s) of the table above apply to the actual diff.
2. Run each applicable command in this session.
3. Paste or summarize the real output (pass/fail counts, the actual status code returned, the actual cascade order observed) — a claim of "tests pass" with no shown output is not verification.
4. If a check fails, fix and re-run — don't report partial success as done.
5. For anything in `code-review.md` §1.4's highest-risk list, follow up with the `code-reviewer` or `security-reviewer` subagent before considering the work finished, not just the mechanical checks above.
