-- PRD §3.2 — attachments & permissions

create extension if not exists "pgcrypto";

-- ── attachments ──────────────────────────────────────────────
create table if not exists public.attachments (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users (id) on delete cascade,
  filename      text not null,
  storage_path  text not null,
  mime_type     text not null,
  byte_size     bigint not null check (byte_size >= 0),
  page_count    int,
  annotations   jsonb not null default '[]'::jsonb,
  burned_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists attachments_owner_id_idx on public.attachments (owner_id);

-- ── permissions ──────────────────────────────────────────────
create type public.permission_level as enum ('read', 'write', 'admin');

create table if not exists public.permissions (
  id              uuid primary key default gen_random_uuid(),
  attachment_id   uuid not null references public.attachments (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  level           public.permission_level not null default 'read',
  can_burn_in     boolean not null default false,
  granted_by      uuid references auth.users (id),
  created_at      timestamptz not null default now(),
  unique (attachment_id, user_id)
);

create index if not exists permissions_attachment_id_idx on public.permissions (attachment_id);
create index if not exists permissions_user_id_idx on public.permissions (user_id);

-- ── updated_at trigger ───────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger attachments_set_updated_at
  before update on public.attachments
  for each row execute function public.set_updated_at();

-- ── RLS (enable; policies to be refined in app) ──────────────
alter table public.attachments enable row level security;
alter table public.permissions enable row level security;
