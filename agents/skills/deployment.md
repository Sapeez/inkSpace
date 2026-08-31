# Deployment

- Frontend: `npm run build` → host the `dist/` output (Vercel, Netlify, S3+CloudFront, etc.). Set `VITE_*` env vars at build time.
- Backend: deploy `server/` to any Node host (Railway, Render, Fly.io). Set the server-side env vars from `.env.example`.
- Database: run `supabase/migrations/` against the target Supabase project before or during deploy.
