-- The Settings modal no longer has a profile display name. Clear the value the
-- old Settings page stored in each user's auth metadata
-- (`supabase.auth.updateUser({ data: { display_name } })`), so nothing
-- lingers in the database. Idempotent: users without the key are untouched.
-- Does NOT touch `public.workspaces.display_name` (the workspace's own name).
update auth.users
set raw_user_meta_data = raw_user_meta_data - 'display_name'
where raw_user_meta_data ? 'display_name';
