import 'dotenv/config';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { requireAuth } from './middleware/requireAuth.js';
import authRouter from './routes/auth.js';
import attachmentsRouter from './routes/attachments.js';
import burnInRouter from './routes/burn-in.js';
import accountRouter from './routes/account.js';
import workspaceRouter from './routes/workspace.js';
import foldersRouter from './routes/folders.js';

const app = express();
const PORT = Number(process.env.PORT) || 3002;

app.use(cors());
// Burn-in (task 3.2) and save (task 3.3) both carry a full PDF as base64 JSON
// (~33% larger than the raw file) in each direction — 1mb was fine for the
// old timestamp/watermark-only payloads but is too small for a real document.
// Task 5.3 still owns the authoritative, user-facing PDF size limit
// (`MAX_UPLOAD_BYTES`); this is just the outer body-parser ceiling so a
// legitimate upload up to that limit doesn't get a raw 413 first.
app.use(express.json({ limit: '20mb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Mounted before the global `requireAuth` gate below: logging in is, by
// definition, something an unauthenticated caller must be able to do (LG5).
app.use('/api/auth', authRouter);

// 1.7: every other `/api` route requires a verified Supabase session — there
// is no public read anywhere in this API. Mounted once here rather than
// per-route so new routers (folders/workspace/account, tasks 3–4) get it for
// free.
app.use('/api', requireAuth);

app.use('/api/attachments', attachmentsRouter);
app.use('/api/burn-in', burnInRouter);
// accounts-workspace tasks 3.0/4.0: account (cascading delete), workspace
// (display name), and folder CRUD/move — every handler in these three
// routers reads identity off `req.userId`, set by the global `requireAuth`
// above, never from a route param.
app.use('/api/account', accountRouter);
app.use('/api/workspace', workspaceRouter);
app.use('/api/folders', foldersRouter);

// Production: serve the Vite build (`npm run build` -> dist/) from this same
// process. Dev doesn't hit this — Vite serves the client and proxies /api here.
// Unknown /api paths are excluded from the SPA fallback so they still 404
// instead of returning index.html.
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
if (existsSync(path.join(distDir, 'index.html'))) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api(\/|$)).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status ?? 500).json({ message: err.message ?? 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
