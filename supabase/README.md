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

| Table           | Purpose                                      |
| --------------- | -------------------------------------------- |
| `attachments`   | File metadata, storage path, annotation JSON |
| `permissions`   | Per-user read/write/admin + burn-in flag     |

See `migrations/20250824000000_attachments_permissions.sql` for the full DDL.

## Auth email templates

Branded inkSpace emails live in `templates/` (`confirm-signup.html`, `recovery.html`). Hosted Supabase doesn't read them from the repo — paste each into **Authentication → Emails → Templates** in the dashboard:

| File                  | Dashboard template | Subject suggestion                 |
| --------------------- | ------------------ | ---------------------------------- |
| `confirm-signup.html` | Confirm sign up    | `Confirm your inkSpace account`    |
| `recovery.html`       | Reset password     | `Reset your inkSpace password`     |

The logo is loaded from `{{ .SiteURL }}/inksapce-logo.png` (served from `public/`), so **Site URL** (Authentication → URL Configuration) must be a publicly reachable deployed URL — email clients can't load it from `localhost`. The sender name/address ("Supabase Auth") is only changeable by configuring a custom SMTP provider under Authentication → SMTP Settings.
