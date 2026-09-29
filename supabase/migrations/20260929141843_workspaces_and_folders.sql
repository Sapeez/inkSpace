-- accounts-workspace PRD §3 — workspaces & folders (tasks/tasks-accounts-workspace.md 4.1)
--
-- `workspaces` is 1:1 with `auth.users`: its primary key *is* the owning
-- user's id (not a separate uuid + unique constraint), so every downstream
-- ownership check is a direct `workspace_id = auth.uid()` / `= req.userId`
-- comparison with no join back to a users table required.
--
-- `folders` is workspace-scoped and self-referencing (`parent_folder_id`,
-- null = top-level). Deleting a folder cascades to its subfolders (there is
-- no "promote subfolders to top level" requirement in the PRD) but must NOT
-- delete the files inside it (WF4/R3) — that's enforced by `attachments
-- .folder_id` using `on delete set null` rather than `on delete cascade`,
-- so a folder disappearing always returns its files to the top-level list
-- structurally, not by relying on application code to remember to do so.

create table if not exists public.workspaces (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null default 'My Workspace',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger workspaces_set_updated_at
  before update on public.workspaces
  for each row execute function public.set_updated_at();

alter table public.workspaces enable row level security;

create policy "workspaces are readable by their owner"
  on public.workspaces for select
  using (auth.uid() = id);

create policy "workspaces are updatable by their owner"
  on public.workspaces for update
  using (auth.uid() = id);

-- ── folders ──────────────────────────────────────────────────
create table if not exists public.folders (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces (id) on delete cascade,
  name              text not null,
  parent_folder_id  uuid references public.folders (id) on delete cascade,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists folders_workspace_id_idx on public.folders (workspace_id);
create index if not exists folders_parent_folder_id_idx on public.folders (parent_folder_id);

create trigger folders_set_updated_at
  before update on public.folders
  for each row execute function public.set_updated_at();

alter table public.folders enable row level security;

create policy "folders are readable by their workspace's owner"
  on public.folders for select
  using (auth.uid() = workspace_id);

create policy "folders are writable by their workspace's owner"
  on public.folders for all
  using (auth.uid() = workspace_id)
  with check (auth.uid() = workspace_id);

-- ── attachments gains folder_id (WF1-WF4) ───────────────────
alter table public.attachments
  add column if not exists folder_id uuid references public.folders (id) on delete set null;

create index if not exists attachments_folder_id_idx on public.attachments (folder_id);
