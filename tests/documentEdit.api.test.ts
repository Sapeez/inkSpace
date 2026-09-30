import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import 'dotenv/config';
import express from 'express';
import type { Server } from 'node:http';
import { PDFDocument } from 'pdf-lib';
import { supabase } from '../server/lib/supabaseClient.js';
import { requireAuth } from '../server/middleware/requireAuth.js';
import attachmentsRouter from '../server/routes/attachments.js';
import { createTestSession, HAS_AUTH_TEST_CREDS } from './helpers/testAuthUser.js';
import type { TestSession } from './helpers/testAuthUser.js';

// Real HTTP + real Storage against POST /api/attachments/:id/pages (the Document
// editor's save): owner-only, rewrites the file's pages, repoints the row at a
// new Storage object and removes the old one.

const BUCKET = process.env.STORAGE_BUCKET;
const HAS_CREDS = Boolean(BUCKET && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && HAS_AUTH_TEST_CREDS);

function headers(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' };
}

async function pdfWithWidths(widths: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  widths.forEach((width) => doc.addPage([width, 50]));
  return doc.save();
}

async function startApp(app: express.Express): Promise<{ baseUrl: string; server: Server }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ baseUrl: `http://127.0.0.1:${port}`, server });
    });
  });
}

test(
  'document editor save: owner-only, rewrites pages, swaps the stored object',
  { skip: !HAS_CREDS && 'requires STORAGE_BUCKET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_ANON_KEY' },
  async (t) => {
    const bucket = BUCKET as string;
    const owner: TestSession = await createTestSession();
    const stranger: TestSession = await createTestSession();
    const originalPath = `scratch-tests/document-edit-${randomUUID()}.pdf`;
    const original = await pdfWithWidths([100, 200, 300]);

    const upload = await supabase.storage.from(bucket).upload(originalPath, original, { contentType: 'application/pdf' });
    assert.equal(upload.error, null);
    const insert = await supabase
      .from('attachments')
      .insert({ owner_id: owner.userId, filename: 'document-edit-test.pdf', storage_path: originalPath, mime_type: 'application/pdf', byte_size: original.length, page_count: 3 })
      .select('id')
      .single();
    assert.equal(insert.error, null);
    const attachmentId = insert.data!.id as string;

    const app = express();
    app.use(express.json({ limit: '20mb' }));
    app.use('/api', requireAuth);
    app.use('/api/attachments', attachmentsRouter);
    const { baseUrl, server } = await startApp(app);
    const url = `${baseUrl}/api/attachments/${attachmentId}/pages`;
    const extra = Buffer.from(await pdfWithWidths([700])).toString('base64');
    const body = JSON.stringify({
      uploads: [extra],
      pages: [
        { source: 0, pageIndex: 2, rotate: 0 },
        { source: 1, pageIndex: 0, rotate: 90 },
        { source: 0, pageIndex: 0, rotate: 0 },
      ],
    });

    let currentPath = originalPath;
    try {
      await t.test('unauthenticated gets 401, a stranger gets 403 and the file is untouched', async () => {
        assert.equal((await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body })).status, 401);
        assert.equal((await fetch(url, { method: 'POST', headers: headers(stranger.accessToken), body })).status, 403);
        const { data } = await supabase.from('attachments').select('storage_path, page_count').eq('id', attachmentId).single();
        assert.deepEqual(data, { storage_path: originalPath, page_count: 3 });
      });

      await t.test('bad payloads are rejected with 400 and change nothing', async () => {
        for (const bad of [{ pages: [] }, { pages: [{ source: 0, pageIndex: 9, rotate: 0 }] }, { pages: [{ source: 0, pageIndex: 0, rotate: 45 }] }, { uploads: [Buffer.from('hello').toString('base64')], pages: [{ source: 1, pageIndex: 0, rotate: 0 }] }]) {
          const response = await fetch(url, { method: 'POST', headers: headers(owner.accessToken), body: JSON.stringify(bad) });
          assert.equal(response.status, 400, JSON.stringify(bad).slice(0, 60));
        }
        const { data } = await supabase.from('attachments').select('page_count').eq('id', attachmentId).single();
        assert.equal(data?.page_count, 3);
      });

      await t.test('the owner\'s edit rewrites the pages, repoints the row, and removes the old object', async () => {
        const response = await fetch(url, { method: 'POST', headers: headers(owner.accessToken), body });
        assert.equal(response.status, 200);
        assert.equal((await response.json()).pageCount, 3);

        const { data: row } = await supabase.from('attachments').select('storage_path, page_count, byte_size').eq('id', attachmentId).single();
        assert.notEqual(row?.storage_path, originalPath, 'a new Storage object, not an in-place overwrite');
        assert.equal(row?.page_count, 3);
        currentPath = row!.storage_path;

        const { data: file } = await supabase.storage.from(bucket).download(currentPath);
        const edited = await PDFDocument.load(new Uint8Array(await file!.arrayBuffer()));
        assert.deepEqual(edited.getPages().map((page) => page.getWidth()), [300, 700, 100]);
        assert.equal(edited.getPage(1).getRotation().angle, 90);
        assert.equal(row?.byte_size, (await file!.arrayBuffer()).byteLength);

        const { data: old } = await supabase.storage.from(bucket).download(originalPath);
        assert.equal(old, null, 'the replaced object is cleaned up');
      });
    } finally {
      server.close();
      await supabase.from('attachments').delete().eq('id', attachmentId);
      await supabase.storage.from(bucket).remove([originalPath, currentPath]);
      await owner.cleanup();
      await stranger.cleanup();
    }
  },
);
