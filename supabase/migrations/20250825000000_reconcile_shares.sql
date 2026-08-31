-- Reconciles the schema created in 20250824000000_attachments_permissions.sql
-- with the edit/view, by-email sharing model actually specified in the PDF
-- editor and accounts-workspace PRDs and used throughout
-- tasks/tasks-pdf-editor.md (§4.1) and tasks/tasks-accounts-workspace.md
-- (relevant-files list, §3.4, §5.1). Those task lists were written against a
-- `shares` table (grantee_email, role edit|view, granted_by) that never
-- matched the `permissions` table (level read|write|admin, can_burn_in) the
-- earlier migration actually created.
--
-- This is a straight replacement, not a data migration: no application code
-- queries `public.permissions` yet — server/middleware/permissions.js is
-- still a TODO-stub (`return true`) reading a client-supplied `x-user-id`
-- header, which task 1.6 of tasks-accounts-workspace.md replaces with real
-- `requireAuth` / verified-JWT identity regardless of which table backs it.

drop table if exists public.permissions;
drop type if exists public.permission_level;

create type public.share_role as enum ('edit', 'view');

create table if not exists public.shares (
  id               uuid primary key default gen_random_uuid(),
  attachment_id    uuid not null references public.attachments (id) on delete cascade,
  grantee_email    text not null,
  grantee_user_id  uuid references auth.users (id) on delete cascade,
  role             public.share_role not null default 'view',
  granted_by       uuid not null references auth.users (id) on delete cascade,
  granted_at       timestamptz not null default now(),
  unique (attachment_id, grantee_email)
);

create index if not exists shares_attachment_id_idx on public.shares (attachment_id);
create index if not exists shares_grantee_user_id_idx on public.shares (grantee_user_id);
create index if not exists shares_grantee_email_idx on public.shares (lower(grantee_email));

alter table public.shares enable row level security;
