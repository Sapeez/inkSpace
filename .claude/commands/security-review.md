---
description: Focused auth/authorization/upload-safety/cascading-delete review, per agents/rules/code-review.md §4.2-§4.5.
---

Invoke the `security-reviewer` subagent on $ARGUMENTS (default: the current uncommitted diff).

Run this before opening any PR that touches `server/middleware/permissions.js`, `requireAuth`, a route that mutates data, Supabase Storage/service-role usage, sharing/grants, or account/folder deletion. The subagent checks identity source, per-endpoint authorization, cascading-delete correctness, and upload re-encoding — it does not restate generic OWASP advice, only this repo's actual non-negotiables.
