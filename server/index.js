import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { requireAuth } from './middleware/requireAuth.js';
import authRouter from './routes/auth.js';
import attachmentsRouter from './routes/attachments.js';
import burnInRouter from './routes/burn-in.js';
import sharesRouter from './routes/shares.js';
import accountRouter from './routes/account.js';
import workspaceRouter from './routes/workspace.js';
import foldersRouter from './routes/folders.js';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

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
// 4.4: owner-only grant/list/revoke of shares — mounted with its own
// `:attachmentId` param (mergeParams in shares.ts) rather than nested inside
// attachmentsRouter, per the file split in tasks/tasks-pdf-editor.md's
// Relevant Files.
app.use('/api/attachments/:attachmentId/shares', sharesRouter);
// accounts-workspace tasks 3.0/4.0: account (cascading delete), workspace
// (display name), and folder CRUD/move — every handler in these three
// routers reads identity off `req.userId`, set by the global `requireAuth`
// above, never from a route param.
app.use('/api/account', accountRouter);
app.use('/api/workspace', workspaceRouter);
app.use('/api/folders', foldersRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status ?? 500).json({ message: err.message ?? 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
