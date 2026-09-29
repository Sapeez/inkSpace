import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { supabase } from '../../server/lib/supabaseClient.js';

export interface TestSession {
  userId: string;
  accessToken: string;
  cleanup: () => Promise<void>;
}

export const HAS_AUTH_TEST_CREDS = Boolean(
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.VITE_SUPABASE_ANON_KEY,
);

// Test-only: creates a real scratch user and signs them in exactly the way
// the browser does (an anon-key client, `supabase.auth.signInWithPassword`),
// so `requireAuth`/`requirePermission` (task 1.7) are exercised against a
// genuine Supabase JWT rather than a stubbed `x-user-id` header, which no
// longer exists anywhere in this codebase. `VITE_SUPABASE_ANON_KEY` is
// otherwise a client-only env var (agents/skills/backend-patterns.md) — this
// is test setup simulating the browser, not server code.
export async function createTestSession(): Promise<TestSession> {
  const anonUrl = process.env.SUPABASE_URL as string;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY as string;
  const email = `test-${randomUUID()}@example.com`;
  const password = randomUUID();

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError || !created.user) {
    throw new Error(`Failed to create test user: ${createError?.message ?? 'unknown error'}`);
  }
  const userId = created.user.id;

  // Node 20 has no native WebSocket; supply `ws` so the client's Realtime
  // setup doesn't throw at construction time (same fix as
  // `server/lib/supabaseClient.ts`), even though this helper never uses
  // Realtime.
  const anonClient = createClient(anonUrl, anonKey, {
    realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
  });
  const { data: signedIn, error: signInError } = await anonClient.auth.signInWithPassword({ email, password });
  if (signInError || !signedIn.session) {
    await supabase.auth.admin.deleteUser(userId);
    throw new Error(`Failed to sign in test user: ${signInError?.message ?? 'unknown error'}`);
  }

  return {
    userId,
    accessToken: signedIn.session.access_token,
    cleanup: async () => {
      await supabase.auth.admin.deleteUser(userId);
    },
  };
}
