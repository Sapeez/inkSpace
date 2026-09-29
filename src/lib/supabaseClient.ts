import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

// Mirrors `server/lib/supabaseClient.ts` but with the anon key, for the
// browser's own Auth calls (signUp/signInWithPassword/resetPasswordForEmail/
// updateUser) — never the service-role key, which must stay server-only.
//
// Vite injects `import.meta.env` via its own build-time transform; a test run
// directly under `node --import tsx --test` (no Vite) has no such transform,
// so this also falls back to `process.env` (populated via `dotenv/config`,
// the pattern `tests/*.test.ts` already use) — same reasoning as `http.ts`'s
// `API_BASE`.
function resolveEnv(key: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_ANON_KEY'): string | undefined {
  return import.meta.env?.[key] ?? (typeof process !== 'undefined' ? process.env[key] : undefined);
}

let client: SupabaseClient | undefined;

// Lazy, not constructed at import time: `src/lib/http.ts`'s `request()` (and
// so almost every component under `src/`) transitively imports this module,
// including plenty of code with nothing to do with auth. Constructing
// eagerly would mean any test that merely imports that chain has to provide
// real Supabase credentials just to load a module it never calls into.
export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    const supabaseUrl = resolveEnv('VITE_SUPABASE_URL');
    const supabaseAnonKey = resolveEnv('VITE_SUPABASE_ANON_KEY');
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set');
    }
    client = createClient(supabaseUrl, supabaseAnonKey);
  }
  return client;
}
