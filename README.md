# Brand You

Web app (inkSpace) for viewing PDFs, annotating them on a canvas, burning the annotations into a new file, editing a document's pages, and managing a personal, owner-only workspace of attachments.

## Features

- **Accounts** — email/password signup and login, email verification, password reset, and a Settings modal (change password, delete account).
- **Workspace** — upload up to 5 PDFs at a time, sortable/paginated file list, Recent grid, search, download and delete.
- **Viewer** — continuous scroll, thumbnails, page navigator, zoom (buttons, Ctrl/Cmd+wheel, pinch), pan, fit width.
- **Annotations** — pen, highlighter, text (font/size, bold/italic/underline), ellipse, rectangle, line, arrow, cloud, signature image, and strikethrough/highlight/underline on selected text. Per-tool color and width.
- **Draft autosave** — annotations save automatically and are restored when the file is reopened.
- **Save / Download** — annotations are burned into a new PDF server-side (`pdf-lib`); Save creates a new attachment, Download keeps the original name.
- **Document editor** — upload/insert PDF pages, rotate, delete and drag to reorder pages (this replaces the stored file).
- **Permissions** — every attachment is reachable only by its owner; there is no sharing.

## Stack

| Layer    | Tech                          |
| -------- | ----------------------------- |
| Frontend | React 19 + Vite + React Router, pdf.js, Fabric.js |
| Backend  | Node.js + Express, pdf-lib    |
| Database | Supabase (Postgres + Auth + Storage) |

## Prerequisites

- Node.js 20+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (optional, for migrations)
- A Supabase project (URL + anon + service role keys); tests that need credentials skip themselves without them

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your Supabase credentials

# 3. Apply database schema (if using Supabase CLI)
npm run supabase:migrate

# 4. Run frontend + backend together
npm run dev
```

- **Frontend:** http://localhost:5173  
- **API:** http://localhost:3002  

## Project layout

```
src/                 Frontend: routes (auth pages), workspace, viewer, toolbar,
                     annotation-canvas, modals (save, settings, document editor)
src/lib/             API client wrappers (fetch / create / change / remove) and auth helpers
server/              Backend: routes, services (burn-in, drafts, document edit,
                     storage, account), auth and permission middleware
supabase/            Migrations (attachments, workspaces/folders, drafts), auth email templates
tests/               node --test suites; tests/fixtures/ holds PRD appendix fixtures
spec.md              Living spec for the PDF editor feature
tasks/               PRD-derived task lists
```

## Scripts

| Command              | Description                    |
| -------------------- | ------------------------------ |
| `npm run dev`        | Client + server in watch mode  |
| `npm run build`      | Production frontend build      |
| `npm start`          | Production API server          |
| `npm test`           | Run test suite (`node --test`) |
| `npm run typecheck`  | `tsc --noEmit`                 |
| `npm run supabase:migrate` | Push migrations to Supabase |

## Deploy

1. **Frontend** — build with `npm run build` and host `dist/` (Vercel, Netlify, S3+CloudFront, etc.). Set `VITE_*` env vars at build time.
2. **Backend** — deploy `server/` to any Node host (Railway, Render, Fly.io). Set server env vars from `.env.example`.
3. **Database** — run migrations in `supabase/migrations/` against your Supabase project (`npm run supabase:migrate`). The draft-autosave and workspace features need the latest migrations.
4. **Auth** — paste the email templates from `supabase/templates/` into the Supabase dashboard and add `<origin>/reset-password` to the Auth redirect-URL allow-list (see `supabase/README.md`).

## Test fixtures

See `tests/fixtures/README.md` for the PRD appendix fixture set used in integration tests.
