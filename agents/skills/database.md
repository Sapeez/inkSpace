# Database & Supabase

Postgres + Storage via Supabase. Schema and migrations live in `supabase/migrations/`. Apply migrations with `npm run supabase:migrate` (wraps `supabase db push`), using the Supabase CLI linked to the project.

## Current schema

**`attachments`** (`20250824000000_attachments_permissions.sql`) — `id`, `owner_id` (FK `auth.users`), `filename`, `storage_path`, `mime_type`, `byte_size`, `page_count`, `annotations` (jsonb), `burned_at`, `created_at`, `updated_at`. Will gain a nullable `folder_id` (FK → `folders`) once the accounts-workspace migration (task 1.3 of `tasks/tasks-accounts-workspace.md`) lands.

**`shares`** (`20250825000000_reconcile_shares.sql`) — `id`, `attachment_id` (FK `attachments`), `grantee_email`, `grantee_user_id` (nullable FK `auth.users` — populated once the grantee has a real account), `role` (`edit` | `view`), `granted_by` (FK `auth.users`), `granted_at`. This is the single source of truth for both the PDF editor's per-file sharing (P1–P5) and the accounts-workspace Members/Access (WM1–WM3) and Shared-with-me (WS1–WS3) views — do not add a second sharing/permission table; both views must read this one (PRD Risk R5).

This table **supersedes** an earlier `permissions` table (`level: read|write|admin`, `can_burn_in`) from the original migration, which never matched the edit/view-by-email model the PRDs and task lists actually specify and was never queried by real application code (`server/middleware/permissions.js` is still a `return true` stub as of this writing). If you find code or docs referencing `permissions` instead of `shares`, that's stale — update it to match this file.

**Not yet created:** `workspaces` (one row per user, 1:1) and `folders` (workspace-scoped, self-referencing `parent_id`) — see task 1.3 of `tasks/tasks-accounts-workspace.md` for the exact shape to create when that work starts.

## Access

- Server code uses the Supabase **service role key** (`SUPABASE_SERVICE_ROLE_KEY`) — never expose it to the browser or a log line reachable from the frontend.
- Client code uses only the **anon key** (`VITE_SUPABASE_ANON_KEY`).
- Application identity always comes from a verified Supabase JWT (via `requireAuth`, once task 1.6 of `tasks/tasks-accounts-workspace.md` lands) — never from a client-supplied user ID or header.
