import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import 'dotenv/config';
import express from 'express';
import type { Server } from 'node:http';
import { supabase } from '../server/lib/supabaseClient.js';

// 4.11/Risk R4: calls the API directly (real HTTP, not through any UI) to
// confirm permission enforcement doesn't depend on what a client chooses to
// render. Playwright-level coverage of the same requirement
// (agents/rules/integration-tests.md §15) isn't possible in this repo yet —
// `@playwright/test` and the `tests/fixtures/testFixtures`/`BasePage`
// scaffolding it depends on aren't installed, for the same npm-registry
// access reason `pdf-lib` was blocked when tasks/tasks-pdf-editor.md §3 was
// written (see spec.md §3). This file is the `node --test` equivalent.

const OWNER_ID = process.env.TEST_OWNER_USER_ID;
const BUCKET = process.env.STORAGE_BUCKET;
const HAS_CREDS = Boolean(OWNER_ID && BUCKET && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

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
  '4.5/4.11/Risk R4: the shares endpoints reject unauthenticated and non-owner callers with the right status',
  { skip: !HAS_CREDS && 'requires TEST_OWNER_USER_ID, STORAGE_BUCKET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY' },
  async (t) => {
    const ownerId = OWNER_ID as string;
    const bucket = BUCKET as string;
    const storagePath = `scratch-tests/permissions-api-${randomUUID()}.pdf`;

    const upload = await supabase.storage
      .from(bucket)
      .upload(storagePath, Buffer.from('%PDF-1.4 test fixture'), { contentType: 'application/pdf' });
    assert.equal(upload.error, null);

    const insert = await supabase
      .from('attachments')
      .insert({
        owner_id: ownerId,
        filename: 'permissions-api-test.pdf',
        storage_path: storagePath,
        mime_type: 'application/pdf',
        byte_size: 21,
        page_count: 1,
      })
      .select('id')
      .single();
    assert.equal(insert.error, null);
    const attachmentId = insert.data.id as string;

    const { default: sharesRouter } = await import('../server/routes/shares.js');
    const app = express();
    app.use(express.json());
    app.use('/api/attachments/:attachmentId/shares', sharesRouter);
    const { baseUrl, server } = await startApp(app);

    try {
      await t.test('unauthenticated request to the shares list gets 401, not a silent empty list', async () => {
        const response = await fetch(`${baseUrl}/api/attachments/${attachmentId}/shares`);
        assert.equal(response.status, 401);
        const body = await response.json();
        assert.equal(body.message, 'Authentication required');
      });

      await t.test('a non-owner GET/POST to shares gets 403, not 404', async () => {
        const stranger = randomUUID();
        const getResponse = await fetch(`${baseUrl}/api/attachments/${attachmentId}/shares`, {
          headers: { 'x-user-id': stranger },
        });
        assert.equal(getResponse.status, 403);

        const postResponse = await fetch(`${baseUrl}/api/attachments/${attachmentId}/shares`, {
          method: 'POST',
          headers: { 'x-user-id': stranger, 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'someone@example.com', role: 'view' }),
        });
        assert.equal(postResponse.status, 403);
      });

      let shareId = '';

      await t.test('the owner can grant a share over real HTTP, without leaking the grantee\'s real user id', async () => {
        const response = await fetch(`${baseUrl}/api/attachments/${attachmentId}/shares`, {
          method: 'POST',
          headers: { 'x-user-id': ownerId, 'content-type': 'application/json' },
          body: JSON.stringify({ email: `share-target-${randomUUID()}@example.com`, role: 'view' }),
        });
        assert.equal(response.status, 201);
        const body = await response.json();
        shareId = body.id;
        assert.equal(body.role, 'view');
        // Found in review: the grantee's raw auth.users UUID must never
        // reach the browser — given identity here is still the x-user-id
        // header stub, leaking it would let anyone who reads this response
        // impersonate that user on every other route.
        assert.equal('granteeUserId' in body, false);
        assert.equal('grantee_user_id' in body, false);
        assert.equal('grantedBy' in body, false);
      });

      await t.test('the shares list also never includes the grantee\'s real user id', async () => {
        const response = await fetch(`${baseUrl}/api/attachments/${attachmentId}/shares`, {
          headers: { 'x-user-id': ownerId },
        });
        assert.equal(response.status, 200);
        const body = await response.json();
        assert.ok(Array.isArray(body) && body.length > 0);
        for (const share of body) {
          assert.equal('granteeUserId' in share, false);
          assert.equal('grantee_user_id' in share, false);
          assert.equal('grantedBy' in share, false);
        }
      });

      await t.test('a non-owner cannot revoke a share', async () => {
        const stranger = randomUUID();
        const response = await fetch(`${baseUrl}/api/attachments/${attachmentId}/shares/${shareId}`, {
          method: 'DELETE',
          headers: { 'x-user-id': stranger },
        });
        assert.equal(response.status, 403);
      });

      await t.test('an invalid grant body is rejected with 400, not silently accepted', async () => {
        const response = await fetch(`${baseUrl}/api/attachments/${attachmentId}/shares`, {
          method: 'POST',
          headers: { 'x-user-id': ownerId, 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'not-an-email', role: 'view' }),
        });
        assert.equal(response.status, 400);
      });
    } finally {
      server.close();
      await supabase.from('shares').delete().eq('attachment_id', attachmentId);
      await supabase.from('attachments').delete().eq('id', attachmentId);
      await supabase.storage.from(bucket).remove([storagePath]);
    }
  },
);

test(
  '4.5/Risk R4: burn-in and the attachment fetch reject a non-edit caller with 403/401 over real HTTP',
  { skip: !HAS_CREDS && 'requires TEST_OWNER_USER_ID, STORAGE_BUCKET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY' },
  async (t) => {
    let attachmentsRouter: express.Router;
    let burnInRouter: express.Router;
    try {
      attachmentsRouter = (await import('../server/routes/attachments.js')).default;
      burnInRouter = (await import('../server/routes/burn-in.js')).default;
    } catch (err) {
      t.skip(
        `pdf-lib isn't installed in this environment (see spec.md §3) — attachments.js/burn-in.js import it ` +
          `at module load time, so they can't even be imported yet: ${(err as Error).message}`,
      );
      return;
    }

    const ownerId = OWNER_ID as string;
    const bucket = BUCKET as string;
    const storagePath = `scratch-tests/permissions-api-burnin-${randomUUID()}.pdf`;

    const upload = await supabase.storage
      .from(bucket)
      .upload(storagePath, Buffer.from('%PDF-1.4 test fixture'), { contentType: 'application/pdf' });
    assert.equal(upload.error, null);

    const insert = await supabase
      .from('attachments')
      .insert({
        owner_id: ownerId,
        filename: 'permissions-api-burnin-test.pdf',
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
    app.use(express.json({ limit: '20mb' }));
    app.use('/api/attachments', attachmentsRouter);
    app.use('/api/burn-in', burnInRouter);
    const { baseUrl, server } = await startApp(app);

    try {
      await t.test('unauthenticated request to burn-in gets 401', async () => {
        const response = await fetch(`${baseUrl}/api/burn-in/${attachmentId}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ pages: [] }),
        });
        assert.equal(response.status, 401);
      });

      await t.test('a view-only (no share at all) caller gets 403 from burn-in, not 200', async () => {
        const stranger = randomUUID();
        const response = await fetch(`${baseUrl}/api/burn-in/${attachmentId}`, {
          method: 'POST',
          headers: { 'x-user-id': stranger, 'content-type': 'application/json' },
          body: JSON.stringify({ pages: [] }),
        });
        assert.equal(response.status, 403);
      });

      await t.test('a non-owner/non-shared caller gets 403 from the attachment fetch, not 404', async () => {
        const stranger = randomUUID();
        const response = await fetch(`${baseUrl}/api/attachments/${attachmentId}`, {
          headers: { 'x-user-id': stranger },
        });
        assert.equal(response.status, 403);
      });
    } finally {
      server.close();
      await supabase.from('attachments').delete().eq('id', attachmentId);
      await supabase.storage.from(bucket).remove([storagePath]);
    }
  },
);
