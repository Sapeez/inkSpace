import test from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import express from 'express';
import type { Server } from 'node:http';
import { supabase } from '../server/lib/supabaseClient.js';
import { requireAuth } from '../server/middleware/requireAuth.js';
import accountRouter from '../server/routes/account.js';
import { createTestSession, HAS_AUTH_TEST_CREDS } from './helpers/testAuthUser.js';
import type { TestSession } from './helpers/testAuthUser.js';

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
  'US5/R2/4.8: DELETE /api/account has no id param — a caller can only ever delete their own account, and it 401s unauthenticated',
  { skip: !HAS_CREDS && 'requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_ANON_KEY' },
  async (t) => {
    const untouched: TestSession = await createTestSession();
    const toDelete: TestSession = await createTestSession();

    const app = express();
    app.use(express.json());
    app.use('/api', requireAuth);
    app.use('/api/account', accountRouter);
    const { baseUrl, server } = await startApp(app);

    try {
      await t.test('unauthenticated DELETE gets 401, not a silent success', async () => {
        const response = await fetch(`${baseUrl}/api/account`, { method: 'DELETE' });
        assert.equal(response.status, 401);
      });

      await t.test('an authenticated DELETE removes only the caller\'s own account', async () => {
        const response = await fetch(`${baseUrl}/api/account`, {
          method: 'DELETE',
          headers: authHeader(toDelete.accessToken),
        });
        assert.equal(response.status, 204);

        const { data: deletedUser, error: deletedError } = await supabase.auth.admin.getUserById(toDelete.userId);
        assert.ok(deletedError || !deletedUser.user);

        const { data: survivorUser, error: survivorError } = await supabase.auth.admin.getUserById(untouched.userId);
        assert.equal(survivorError, null);
        assert.ok(survivorUser.user);
      });
    } finally {
      server.close();
      await untouched.cleanup();
    }
  },
);
