-- tasks/tasks-accounts-workspace.md task 7.5: cross-account sharing
-- (grant-by-email, edit/view roles) is cut entirely per this PRD's §3.4/WF5
-- revision, not just narrowed — the accounts-workspace model is single-owner
-- only. `public.shares` (created in 20250825000000_reconcile_shares.sql) has
-- no application code left pointing at it as of task 7.2/7.3.

drop table if exists public.shares;
drop type if exists public.share_role;
