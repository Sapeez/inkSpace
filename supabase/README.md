# Supabase

Schema and migrations for **attachments** and **permissions** (PRD §3.2).

## Apply migrations

With the [Supabase CLI](https://supabase.com/docs/guides/cli) linked to your project:

```bash
supabase db push
# or
npm run supabase:migrate
```

## Tables

| Table                | Purpose                                                                 |
| -------------------- | ----------------------------------------------------------------------- |
| `attachments`        | File metadata, storage path, owner (`owner_id`), optional `folder_id`    |
| `attachment_drafts`  | Autosaved annotation draft, one row per attachment (cascade-deleted)     |
| `workspaces`         | One per user, created by a trigger on signup                             |
| `folders`            | Folder rows (API exists; the UI no longer surfaces them)                 |

Attachments are owner-only; the old `shares`/`permissions` tables and `share_role` enum were dropped (`20260929150000_drop_shares.sql`). Migrations are additive — add a new file rather than editing an applied one.

## Auth email templates

Branded inkSpace emails live in `templates/` (`confirm-signup.html`, `recovery.html`). Hosted Supabase doesn't read them from the repo — paste each into **Authentication → Emails → Templates** in the dashboard:

| File                  | Dashboard template | Subject suggestion                 |
| --------------------- | ------------------ | ---------------------------------- |
| `confirm-signup.html` | Confirm sign up    | `Confirm your inkSpace account`    |
| `recovery.html`       | Reset password     | `Reset your inkSpace password`     |

The logo is loaded from `{{ .SiteURL }}/inksapce-logo.png` (served from `public/`), so **Site URL** (Authentication → URL Configuration) must be a publicly reachable deployed URL — email clients can't load it from `localhost`. The sender name/address ("Supabase Auth") is only changeable by configuring a custom SMTP provider under Authentication → SMTP Settings.
