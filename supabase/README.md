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
