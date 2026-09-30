-- Server-side autosave of in-progress annotations (one draft per attachment).
-- A separate table, not `attachments.annotations`: `attachments` has an
-- `updated_at` trigger, and autosaving there would bump the file's "Last
-- modified" in the workspace list on every edit.
create table if not exists public.attachment_drafts (
  attachment_id uuid primary key references public.attachments (id) on delete cascade,
  pages         jsonb not null default '[]'::jsonb,
  updated_at    timestamptz not null default now()
);

-- Only the server (service role) reads/writes drafts, after its own
-- owner-only permission check — no client-facing policies.
alter table public.attachment_drafts enable row level security;
