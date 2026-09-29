import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import 'dotenv/config';
import express from 'express';
import type { Server } from 'node:http';
import { supabase } from '../server/lib/supabaseClient.js';
import { requireAuth } from '../server/middleware/requireAuth.js';
import workspaceRouter from '../server/routes/workspace.js';
import foldersRouter from '../server/routes/folders.js';
import { createTestSession, HAS_AUTH_TEST_CREDS } from './helpers/testAuthUser.js';
import type { TestSession } from './helpers/testAuthUser.js';

// 4.8/Risk R4: real HTTP, not through any UI — confirms a caller can't
// read/write another user's workspace or folders regardless of what a
// client chooses to render, the same reasoning as
// tests/permissions.api.test.ts.

const HAS_CREDS = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && HAS_AUTH_TEST_CREDS);

function authHeader(accessToken: string): { Authorization: string } {
  return { Authorization: `Bearer ${accessToken}` };
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
  '4.3/4.8: /api/workspace requires auth and only ever exposes the caller\'s own workspace',
  { skip: !HAS_CREDS && 'requires STORAGE_BUCKET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_ANON_KEY' },
  async (t) => {
    const owner: TestSession = await createTestSession();

    const app = express();
    app.use(express.json());
    app.use('/api', requireAuth);
    app.use('/api/workspace', workspaceRouter);
    const { baseUrl, server } = await startApp(app);

    try {
      await t.test('unauthenticated GET gets 401', async () => {
        const response = await fetch(`${baseUrl}/api/workspace`);
        assert.equal(response.status, 401);
      });

      await t.test('the owner sees their own workspace, id equal to their user id', async () => {
        const response = await fetch(`${baseUrl}/api/workspace`, { headers: authHeader(owner.accessToken) });
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.id, owner.userId);
        assert.equal(body.displayName, 'My Workspace');
      });

      await t.test('WC1: PATCH updates the display name', async () => {
        const response = await fetch(`${baseUrl}/api/workspace`, {
          method: 'PATCH',
          headers: { ...authHeader(owner.accessToken), 'content-type': 'application/json' },
          body: JSON.stringify({ displayName: 'New Name' }),
        });
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.equal(body.displayName, 'New Name');
      });

      await t.test('an invalid PATCH body is rejected with 400', async () => {
        const response = await fetch(`${baseUrl}/api/workspace`, {
          method: 'PATCH',
          headers: { ...authHeader(owner.accessToken), 'content-type': 'application/json' },
          body: JSON.stringify({ displayName: '' }),
        });
        assert.equal(response.status, 400);
      });
    } finally {
      server.close();
      await owner.cleanup();
    }
  },
);

test(
  '4.4/4.8: /api/folders requires auth and rejects a stranger reading/writing another user\'s folders',
  { skip: !HAS_CREDS && 'requires STORAGE_BUCKET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_ANON_KEY' },
  async (t) => {
    const owner: TestSession = await createTestSession();
    const stranger: TestSession = await createTestSession();

    const app = express();
    app.use(express.json());
    app.use('/api', requireAuth);
    app.use('/api/folders', foldersRouter);
    const { baseUrl, server } = await startApp(app);

    let folderId = '';

    try {
      await t.test('unauthenticated GET/POST get 401', async () => {
        const getResponse = await fetch(`${baseUrl}/api/folders`);
        assert.equal(getResponse.status, 401);
        const postResponse = await fetch(`${baseUrl}/api/folders`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'X' }),
        });
        assert.equal(postResponse.status, 401);
      });

      await t.test('the owner can create and list a folder over real HTTP', async () => {
        const response = await fetch(`${baseUrl}/api/folders`, {
          method: 'POST',
          headers: { ...authHeader(owner.accessToken), 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Reports' }),
        });
        assert.equal(response.status, 201);
        const body = await response.json();
        folderId = body.id;

        const list = await fetch(`${baseUrl}/api/folders`, { headers: authHeader(owner.accessToken) });
        const listBody = await list.json();
        assert.ok(listBody.some((f: { id: string }) => f.id === folderId));
      });

      await t.test('WF5: a stranger cannot rename or delete another user\'s folder — 403, not a silent no-op', async () => {
        const renameResponse = await fetch(`${baseUrl}/api/folders/${folderId}`, {
          method: 'PATCH',
          headers: { ...authHeader(stranger.accessToken), 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Hijacked' }),
        });
        assert.equal(renameResponse.status, 403);

        const deleteResponse = await fetch(`${baseUrl}/api/folders/${folderId}`, {
          method: 'DELETE',
          headers: authHeader(stranger.accessToken),
        });
        assert.equal(deleteResponse.status, 403);
      });

      await t.test('a stranger listing folders never sees another user\'s folder', async () => {
        const response = await fetch(`${baseUrl}/api/folders`, { headers: authHeader(stranger.accessToken) });
        const body = await response.json();
        assert.ok(!body.some((f: { id: string }) => f.id === folderId));
      });
    } finally {
      server.close();
      await supabase.from('folders').delete().eq('id', folderId);
      await owner.cleanup();
      await stranger.cleanup();
    }
  },
);

test(
  'WF3/WF5: a stranger cannot move another user\'s attachment, into their own folder or anywhere else',
  { skip: !HAS_CREDS && 'requires STORAGE_BUCKET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_ANON_KEY' },
  async (t) => {
    const bucket = process.env.STORAGE_BUCKET as string;
    const owner: TestSession = await createTestSession();
    const stranger: TestSession = await createTestSession();
    const storagePath = `scratch-tests/move-file-${randomUUID()}.pdf`;

    const upload = await supabase.storage
      .from(bucket)
      .upload(storagePath, Buffer.from('%PDF-1.4 test fixture'), { contentType: 'application/pdf' });
    assert.equal(upload.error, null);

    const insert = await supabase
      .from('attachments')
      .insert({
        owner_id: owner.userId,
        filename: 'move-file-test.pdf',
        storage_path: storagePath,
        mime_type: 'application/pdf',
        byte_size: 21,
        page_count: 1,
      })
      .select('id')
      .single();
    assert.equal(insert.error, null);
    const attachmentId = insert.data.id as string;

    const strangerFolder = await supabase
      .from('folders')
      .insert({ workspace_id: stranger.userId, name: 'Stranger Folder' })
      .select('id')
      .single();
    assert.equal(strangerFolder.error, null);
    const strangerFolderId = strangerFolder.data.id as string;

    const app = express();
    app.use(express.json());
    app.use('/api', requireAuth);
    app.use('/api/folders', foldersRouter);
    const { baseUrl, server } = await startApp(app);

    try {
      await t.test('a stranger cannot move the owner\'s attachment into their own folder — 403, and it stays unfiled', async () => {
        const response = await fetch(`${baseUrl}/api/folders/move-file/${attachmentId}`, {
          method: 'PATCH',
          headers: { ...authHeader(stranger.accessToken), 'content-type': 'application/json' },
          body: JSON.stringify({ folderId: strangerFolderId }),
        });
        assert.equal(response.status, 403);

        const { data } = await supabase.from('attachments').select('folder_id').eq('id', attachmentId).single();
        assert.equal(data?.folder_id, null);
      });

      await t.test('unauthenticated move-file gets 401', async () => {
        const response = await fetch(`${baseUrl}/api/folders/move-file/${attachmentId}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ folderId: null }),
        });
        assert.equal(response.status, 401);
      });

      await t.test('the owner can move their own attachment', async () => {
        const ownerFolder = await supabase
          .from('folders')
          .insert({ workspace_id: owner.userId, name: 'Owner Folder' })
          .select('id')
          .single();
        assert.equal(ownerFolder.error, null);

        const response = await fetch(`${baseUrl}/api/folders/move-file/${attachmentId}`, {
          method: 'PATCH',
          headers: { ...authHeader(owner.accessToken), 'content-type': 'application/json' },
          body: JSON.stringify({ folderId: ownerFolder.data.id }),
        });
        assert.equal(response.status, 204);

        const { data } = await supabase.from('attachments').select('folder_id').eq('id', attachmentId).single();
        assert.equal(data?.folder_id, ownerFolder.data.id);

        await supabase.from('folders').delete().eq('id', ownerFolder.data.id as string);
      });
    } finally {
      server.close();
      await supabase.from('attachments').delete().eq('id', attachmentId);
      await supabase.storage.from(bucket).remove([storagePath]);
      await supabase.from('folders').delete().eq('id', strangerFolderId);
      await owner.cleanup();
      await stranger.cleanup();
    }
  },
);

test(
  '4.6/4.8: /api/attachments listing is scoped to the caller\'s own workspace only',
  { skip: !HAS_CREDS && 'requires STORAGE_BUCKET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_ANON_KEY' },
  async (t) => {
    let attachmentsRouter: express.Router;
    try {
      attachmentsRouter = (await import('../server/routes/attachments.js')).default;
    } catch (err) {
      t.skip(
        `pdf-lib isn't installed in this environment (see spec.md) — attachments.js imports it at module ` +
          `load time, so it can't even be imported yet: ${(err as Error).message}`,
      );
      return;
    }

    const bucket = process.env.STORAGE_BUCKET as string;
    const owner: TestSession = await createTestSession();
    const other: TestSession = await createTestSession();
    const storagePath = `scratch-tests/attachments-list-${randomUUID()}.pdf`;

    const upload = await supabase.storage
      .from(bucket)
      .upload(storagePath, Buffer.from('%PDF-1.4 test fixture'), { contentType: 'application/pdf' });
    assert.equal(upload.error, null);

    const insert = await supabase
      .from('attachments')
      .insert({
        owner_id: owner.userId,
        filename: 'owner-only.pdf',
        storage_path: storagePath,
        mime_type: 'application/pdf',
        byte_size: 21,
        page_count: 1,
      })
      .select('id')
      .single();
    assert.equal(insert.error, null);
    const attachmentId = insert.data.id as string;

    const app = express();
    app.use(express.json());
    app.use('/api', requireAuth);
    app.use('/api/attachments', attachmentsRouter);
    const { baseUrl, server } = await startApp(app);

    try {
      await t.test('the owner sees their own attachment in the list', async () => {
        const response = await fetch(`${baseUrl}/api/attachments`, { headers: authHeader(owner.accessToken) });
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.ok(body.some((a: { id: string }) => a.id === attachmentId));
      });

      await t.test('WF1: a different user\'s list never includes this attachment', async () => {
        const response = await fetch(`${baseUrl}/api/attachments`, { headers: authHeader(other.accessToken) });
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.ok(!body.some((a: { id: string }) => a.id === attachmentId));
      });

      await t.test('unauthenticated request gets 401, not an empty list', async () => {
        const response = await fetch(`${baseUrl}/api/attachments`);
        assert.equal(response.status, 401);
      });
    } finally {
      server.close();
      await supabase.from('attachments').delete().eq('id', attachmentId);
      await supabase.storage.from(bucket).remove([storagePath]);
      await owner.cleanup();
      await other.cleanup();
    }
  },
);
