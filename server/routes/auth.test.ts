import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import type { Server } from 'node:http';
import authRouter from './auth.js';

async function startApp(): Promise<{ baseUrl: string; server: Server }> {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);

  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ baseUrl: `http://127.0.0.1:${port}`, server });
    });
  });
}

test('rejects a missing/invalid email with 400', async () => {
  const { baseUrl, server } = await startApp();
  try {
    const response = await fetch(`${baseUrl}/api/auth/login-attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    assert.equal(response.status, 400);
  } finally {
    server.close();
  }
});

test('LG5: allows attempts up to the limit, then 429s with a retryAfterSeconds', async () => {
  const { baseUrl, server } = await startApp();
  const email = `rate-limit-${randomUUID()}@example.com`;
  try {
    for (let i = 0; i < 5; i += 1) {
      const response = await fetch(`${baseUrl}/api/auth/login-attempt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      assert.equal(response.status, 204, `attempt ${i + 1} should be allowed`);
    }

    const blocked = await fetch(`${baseUrl}/api/auth/login-attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    assert.equal(blocked.status, 429);
    const body = await blocked.json();
    assert.ok(typeof body.retryAfterSeconds === 'number' && body.retryAfterSeconds > 0);
  } finally {
    server.close();
  }
});

test('LG5: a different email from the same request pattern is not affected by another email being limited', async () => {
  const { baseUrl, server } = await startApp();
  const limitedEmail = `rate-limit-${randomUUID()}@example.com`;
  const freshEmail = `rate-limit-${randomUUID()}@example.com`;
  try {
    for (let i = 0; i < 6; i += 1) {
      await fetch(`${baseUrl}/api/auth/login-attempt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: limitedEmail }),
      });
    }

    const response = await fetch(`${baseUrl}/api/auth/login-attempt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: freshEmail }),
    });
    assert.equal(response.status, 204);
  } finally {
    server.close();
  }
});
