import test from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';
import express from 'express';
import type { Server } from 'node:http';
import { requireAuth } from './requireAuth.js';
import type { PermissionedRequest } from './permissions.js';
import { createTestSession, HAS_AUTH_TEST_CREDS } from '../../tests/helpers/testAuthUser.js';

async function startApp(): Promise<{ baseUrl: string; server: Server }> {
  const app = express();
  app.get('/protected', requireAuth, (req, res) => {
    res.json({ userId: (req as PermissionedRequest).userId });
  });

  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ baseUrl: `http://127.0.0.1:${port}`, server });
    });
  });
}

test('requireAuth rejects a request with no Authorization header', async () => {
  const { baseUrl, server } = await startApp();
  try {
    const response = await fetch(`${baseUrl}/protected`);
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.message, 'Authentication required');
  } finally {
    server.close();
  }
});

test('requireAuth rejects a malformed Authorization header (no Bearer prefix)', async () => {
  const { baseUrl, server } = await startApp();
  try {
    const response = await fetch(`${baseUrl}/protected`, {
      headers: { Authorization: 'not-a-bearer-token' },
    });
    assert.equal(response.status, 401);
  } finally {
    server.close();
  }
});

test(
  'requireAuth rejects an invalid/garbage bearer token',
  { skip: !HAS_AUTH_TEST_CREDS && 'requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_ANON_KEY' },
  async () => {
    const { baseUrl, server } = await startApp();
    try {
      const response = await fetch(`${baseUrl}/protected`, {
        headers: { Authorization: 'Bearer this-is-not-a-real-jwt' },
      });
      assert.equal(response.status, 401);
    } finally {
      server.close();
    }
  },
);

test(
  'requireAuth accepts a genuine Supabase access token and sets req.userId to the real user id',
  { skip: !HAS_AUTH_TEST_CREDS && 'requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_ANON_KEY' },
  async () => {
    const session = await createTestSession();
    const { baseUrl, server } = await startApp();
    try {
      const response = await fetch(`${baseUrl}/protected`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.userId, session.userId);
    } finally {
      server.close();
      await session.cleanup();
    }
  },
);

test(
  'requireAuth rejects an expired/revoked token the same way as a garbage one',
  { skip: !HAS_AUTH_TEST_CREDS && 'requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VITE_SUPABASE_ANON_KEY' },
  async () => {
    const session = await createTestSession();
    const { baseUrl, server } = await startApp();
    try {
      // Deleting the user server-side revokes their sessions — the same
      // observable outcome as an expired token from requireAuth's
      // perspective (auth.getUser rejects it), without waiting out a real
      // token TTL in a test.
      await session.cleanup();
      const response = await fetch(`${baseUrl}/protected`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      assert.equal(response.status, 401);
    } finally {
      server.close();
    }
  },
);
