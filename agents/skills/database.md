# Database & Supabase

Postgres + Storage via Supabase. Schema and migrations live in `supabase/migrations/`. Apply migrations with `npm run supabase:migrate` (wraps `supabase db push`), using the Supabase CLI linked to the project.

## Current schema

**`attachments`** (`20250824000000_attachments_permissions.sql`, gained `folder_id` in `20260929141843_workspaces_and_folders.sql`) — `id`, `owner_id` (FK `auth.users`), `filename`, `storage_path`, `mime_type`, `byte_size`, `page_count`, `annotations` (jsonb), `burned_at`, `folder_id` (nullable FK → `folders`, `on delete set null` — WF4/R3: a deleted folder must never delete its files), `created_at`, `updated_at`.

**`shares`** (`20250825000000_reconcile_shares.sql`) — `id`, `attachment_id` (FK `attachments`), `grantee_email`, `grantee_user_id` (nullable FK `auth.users` — populated once the grantee has a real account), `role` (`edit` | `view`), `granted_by` (FK `auth.users`), `granted_at`. Per-file sharing (P1–P5) only — the accounts-workspace PRD's revision note cuts cross-account sharing entirely (WF5, §3.4), so this table is **not** also backing any workspace/folder-level Members/Access or Shared-with-me view, and is deleted outright in task 7.2 of `tasks/tasks-accounts-workspace.md` once that task lands.

This table **supersedes** an earlier `permissions` table (`level: read|write|admin`, `can_burn_in`) from the original migration, which never matched the edit/view-by-email model the PRDs and task lists actually specify. If you find code or docs referencing `permissions` instead of `shares`, that's stale — update it to match this file.

**`workspaces`** (`20260929141843_workspaces_and_folders.sql`) — one row per user, 1:1: `id` (PK, *also* the FK to `auth.users`, `on delete cascade` — there is no separate workspace uuid, so `workspace_id === auth.uid()` everywhere), `display_name` (default `'My Workspace'`), `created_at`, `updated_at`. A row is created automatically for every `auth.users` insert via the `on_auth_user_created_workspace` trigger (`20260929141903_workspace_auto_create_trigger.sql`, SU3) — no separate "create your workspace" step exists anywhere in the app.

**`folders`** (`20260929141843_workspaces_and_folders.sql`) — workspace-scoped, self-referencing: `id`, `workspace_id` (FK `workspaces`, `on delete cascade`), `name`, `parent_folder_id` (nullable FK → `folders`, `on delete cascade` — null means top-level; deleting a folder cascades to its subfolders, but never to the files inside any of them, per `attachments.folder_id`'s `on delete set null` above), `created_at`, `updated_at`.

## Access

- Server code uses the Supabase **service role key** (`SUPABASE_SERVICE_ROLE_KEY`) — never expose it to the browser or a log line reachable from the frontend.
- Client code uses only the **anon key** (`VITE_SUPABASE_ANON_KEY`).
- Application identity always comes from a verified Supabase JWT (`server/middleware/requireAuth.ts`, mounted ahead of every `/api` route) — never from a client-supplied user ID or header.
- Types are generated (`supabase gen types typescript --linked`, typescript-standard.md §2.7) into `src/lib/database.types.ts`, committed — both `server/lib/supabaseClient.ts` and `src/lib/supabaseClient.ts` construct their client as `createClient<Database>(...)` against it. Regenerate in the same change as any migration that adds/renames/drops a column or table.
