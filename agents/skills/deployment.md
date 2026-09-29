# Deployment

- Frontend: `npm run build` → host the `dist/` output (Vercel, Netlify, S3+CloudFront, etc.). Set `VITE_*` env vars at build time.
- Backend: deploy `server/` to any Node host (Railway, Render, Fly.io). Set the server-side env vars from `.env.example`.
- Database: run `supabase/migrations/` against the target Supabase project before or during deploy.
- **Before going live, set `app.set('trust proxy', <hop count>)` in `server/index.js`.** Every platform above terminates inbound connections through a reverse proxy, so Express's `req.ip` reflects the proxy's address, not the real client, unless `trust proxy` is configured for the exact number of hops in front of the app. `server/lib/authRateLimit.ts`'s login rate limiter (LG5) keys on `req.ip`, so an unset `trust proxy` can fragment or collapse its per-IP buckets (see `spec.md`'s accounts-workspace auth notes). Don't set a bare `true` (trusts every hop, which reintroduces spoofability via a client-supplied `X-Forwarded-For`) — use the specific hop count for whichever platform is actually chosen.
