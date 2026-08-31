# Database & Supabase

- Postgres + Storage via Supabase. Schema and migrations live in `supabase/migrations/`.
- Apply migrations with `npm run supabase:migrate` (wraps `supabase db push`), using the Supabase CLI linked to the project.
- Core tables: `attachments` (file metadata, storage path, annotation JSON) and `permissions` (per-user read/write/admin + burn-in flag).
- Server code uses the Supabase service role key (`SUPABASE_SERVICE_ROLE_KEY`); client code uses only the anon key (`VITE_SUPABASE_ANON_KEY`). Never expose the service role key to the browser.
