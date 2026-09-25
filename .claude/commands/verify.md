---
description: Run this repo's actual verification commands before calling a change done.
---

Run the verification steps that match what changed, per `CLAUDE.md`'s Quick Reference table:

1. `npm run typecheck` (once added per `agents/rules/typescript-standard.md`) then `npm test` — for any TS/JS change.
2. If the diff touches `server/middleware/permissions.js`, folders, or grants: also confirm the specific IDOR case by hand or via `tests/integration/permissions/permission-enforcement.spec.ts` — a second user's request against the first user's resource must return `403`.
3. If the diff touches folder or account deletion: confirm there's a test asserting the *opposite* of the naive bug (folder delete leaves attachments with `folder_id = NULL`; account delete cascades in the documented order).
4. If the diff touches a migration file: `npm run supabase:migrate`, then regenerate Supabase types, then re-run `npm run typecheck`.

Show the actual command output for each step that applies — don't assert a change is verified without having run the command in this session.
