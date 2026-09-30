import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import 'dotenv/config';
import express from 'express';
import type { Server } from 'node:http';
import { supabase } from '../server/lib/supabaseClient.js';
import { requireAuth } from '../server/middleware/requireAuth.js';
import attachmentsRouter from '../server/routes/attachments.js';
import { createTestSession, HAS_AUTH_TEST_CREDS } from './helpers/testAuthUser.js';
import type { TestSession } from './helpers/testAuthUser.js';

// Real HTTP against the autosaved-draft routes: owner-only like the file
// itself, and saving a draft must not touch the file's "Last modified".
// Needs migration 20260930130000_attachment_drafts.sql applied.

const BUCKET = process.env.STORAGE_BUCKET;
const HAS_CREDS = Boolean(BUCKET && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && HAS_AUTH_TEST_CREDS);
const PAGES = [{ pageNumber: 1, objects: [{ type: 'Rect', left: 10, top: 20, width: 30, height: 40 }] }];

function authHeader(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' };
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
  'annotation drafts: owner-only over real HTTP, round-trip, and no effect on the file\'s updated_at',
  { skip: !HAS_CREDS && 'requires STORAGE_BUCKET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_ANON_KEY' },
  async (t) => {
    const owner: TestSession = await createTestSession();
    const stranger: TestSession = await createTestSession();

    const insert = await supabase
      .from('attachments')
      .insert({
        owner_id: owner.userId,
        filename: 'drafts-api-test.pdf',
        storage_path: `scratch-tests/drafts-api-${randomUUID()}.pdf`,
        mime_type: 'application/pdf',
        byte_size: 21,
        page_count: 1,
      })
      .select('id, updated_at')
      .single();
    assert.equal(insert.error, null);
    const attachmentId = insert.data.id as string;
    const originalUpdatedAt = insert.data.updated_at as string;

    const app = express();
    app.use(express.json({ limit: '20mb' }));
    app.use('/api', requireAuth);
    app.use('/api/attachments', attachmentsRouter);
    const { baseUrl, server } = await startApp(app);
    const url = `${baseUrl}/api/attachments/${attachmentId}/draft`;

    try {
      await t.test('unauthenticated GET/PUT get 401', async () => {
        assert.equal((await fetch(url)).status, 401);
        assert.equal((await fetch(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);
      });

      await t.test('a stranger gets 403 on both GET and PUT, and nothing is written', async () => {
        assert.equal((await fetch(url, { headers: authHeader(stranger.accessToken) })).status, 403);
        const put = await fetch(url, { method: 'PUT', headers: authHeader(stranger.accessToken), body: JSON.stringify({ pages: PAGES }) });
        assert.equal(put.status, 403);
        const { data } = await supabase.from('attachment_drafts').select('attachment_id').eq('attachment_id', attachmentId).maybeSingle();
        assert.equal(data, null);
      });

      await t.test('the owner sees an empty draft, saves one, and reads it back', async () => {
        const empty = await (await fetch(url, { headers: authHeader(owner.accessToken) })).json();
        assert.deepEqual(empty, { pages: [], updatedAt: null });

        const put = await fetch(url, { method: 'PUT', headers: authHeader(owner.accessToken), body: JSON.stringify({ pages: PAGES }) });
        assert.equal(put.status, 200);

        const saved = await (await fetch(url, { headers: authHeader(owner.accessToken) })).json();
        assert.deepEqual(saved.pages, PAGES);
        assert.ok(saved.updatedAt);
      });

      await t.test('a malformed draft is rejected with 400', async () => {
        const put = await fetch(url, { method: 'PUT', headers: authHeader(owner.accessToken), body: JSON.stringify({ pages: 'nope' }) });
        assert.equal(put.status, 400);
      });

      await t.test('the attachment list reports draftUpdatedAt for a file with a draft, and null once it is emptied', async () => {
        const listed = await (await fetch(`${baseUrl}/api/attachments`, { headers: authHeader(owner.accessToken) })).json();
        const entry = listed.find((item: { id: string }) => item.id === attachmentId);
        assert.ok(entry?.draftUpdatedAt, 'a saved draft shows up as recent activity');

        await fetch(url, { method: 'PUT', headers: authHeader(owner.accessToken), body: JSON.stringify({ pages: [] }) });
        const after = await (await fetch(`${baseUrl}/api/attachments`, { headers: authHeader(owner.accessToken) })).json();
        assert.equal(after.find((item: { id: string }) => item.id === attachmentId)?.draftUpdatedAt, null);
      });

      await t.test('saving a draft leaves the attachment\'s updated_at untouched', async () => {
        const { data } = await supabase.from('attachments').select('updated_at').eq('id', attachmentId).single();
        assert.equal(data?.updated_at, originalUpdatedAt);
      });

      await t.test('deleting the attachment cascades to its draft', async () => {
        await supabase.from('attachments').delete().eq('id', attachmentId);
        const { data } = await supabase.from('attachment_drafts').select('attachment_id').eq('attachment_id', attachmentId).maybeSingle();
        assert.equal(data, null);
      });
    } finally {
      server.close();
      await supabase.from('attachments').delete().eq('id', attachmentId);
      await owner.cleanup();
      await stranger.cleanup();
    }
  },
);
