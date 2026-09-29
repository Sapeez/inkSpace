-- accounts-workspace PRD SU3 (tasks/tasks-accounts-workspace.md 4.2) — a new
-- `auth.users` row always gets a `workspaces` row for free, so signup never
-- has a separate "create your workspace" step for the client to call (or
-- forget to call, or race with the first login).
--
-- `security definer` is required here: this fires under whatever role
-- triggers `auth.users` inserts (Supabase Auth's own internal role), which
-- has no grant on `public.workspaces` otherwise.

create or replace function public.handle_new_user_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspaces (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_workspace
  after insert on auth.users
  for each row execute function public.handle_new_user_workspace();

-- Backfill: any `auth.users` row created before this trigger existed
-- (including every test/scratch user from earlier sessions of this task
-- list) still needs a workspace, or task 4.3's `GET /api/workspace` 404s for
-- an existing account that never got the chance to run through this trigger.
insert into public.workspaces (id)
select id from auth.users
on conflict (id) do nothing;
