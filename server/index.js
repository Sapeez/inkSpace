import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import attachmentsRouter from './routes/attachments.js';
import burnInRouter from './routes/burn-in.js';
import sharesRouter from './routes/shares.js';

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

app.use('/api/attachments', attachmentsRouter);
app.use('/api/burn-in', burnInRouter);
// 4.4: owner-only grant/list/revoke of shares — mounted with its own
// `:attachmentId` param (mergeParams in shares.ts) rather than nested inside
// attachmentsRouter, per the file split in tasks/tasks-pdf-editor.md's
// Relevant Files.
app.use('/api/attachments/:attachmentId/shares', sharesRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status ?? 500).json({ message: err.message ?? 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
