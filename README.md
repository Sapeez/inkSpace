# Brand You

Web app for viewing documents, annotating on canvas, applying burn-in, and managing permissioned attachments (PRD §3.2).

## Stack

| Layer    | Tech                          |
| -------- | ----------------------------- |
| Frontend | React + Vite + React Router   |
| Backend  | Node.js + Express             |
| Database | Supabase (Postgres + Storage) |

## Prerequisites

- Node.js 20+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (optional, for migrations)
- A Supabase project (URL + anon + service role keys)

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
src/                 Frontend (viewer, toolbar, canvas, modals, routes)
src/lib/             API client wrappers (fetch / create / change / remove)
server/              Backend (burn-in, permissions, save/download)
supabase/            Schema & migrations (attachments, permissions)
tests/fixtures/      PRD appendix fixtures (timestamped file, PDF, image)
```

## Scripts

| Command              | Description                    |
| -------------------- | ------------------------------ |
| `npm run dev`        | Client + server in watch mode  |
| `npm run build`      | Production frontend build      |
| `npm start`          | Production API server          |
| `npm test`           | Run test suite                 |
| `npm run supabase:migrate` | Push migrations to Supabase |

## Deploy

1. **Frontend** — build with `npm run build` and host `dist/` (Vercel, Netlify, S3+CloudFront, etc.). Set `VITE_*` env vars at build time.
2. **Backend** — deploy `server/` to any Node host (Railway, Render, Fly.io). Set server env vars from `.env.example`.
3. **Database** — run migrations in `supabase/migrations/` against your Supabase project.

## Test fixtures

See `tests/fixtures/README.md` for the PRD appendix fixture set used in integration tests.
