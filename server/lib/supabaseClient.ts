import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
}

// Node 20 has no native WebSocket; supply `ws` so the client's Realtime setup
// doesn't throw at construction time, even though this server doesn't use Realtime.
export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
});
