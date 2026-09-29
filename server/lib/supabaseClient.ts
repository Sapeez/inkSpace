import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import type { Database } from '../../src/lib/database.types.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
}

// Node 20 has no native WebSocket; supply `ws` so the client's Realtime setup
// doesn't throw at construction time, even though this server doesn't use Realtime.
// typescript-standard.md §2.7: typed against the generated `Database` schema
// so a migration that renames/drops a column surfaces as a compile error at
// every `.from(...)` call site, not just at runtime.
export const supabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
  realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
});
