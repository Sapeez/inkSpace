import { supabase } from '../lib/supabaseClient.js';

// P1/P2: best-effort email -> user id resolution for the share-grant flow.
// There is no `profiles` table yet (agents/skills/database.md) and `auth.users`
// isn't exposed over PostgREST, so the admin API's `listUsers` is the only
// lookup surface available; it has no email filter, so this pages through
// results and matches client-side. Doesn't scale past one page (1000 users) —
// replace with a `profiles` table lookup once accounts-workspace lands.
export async function resolveUserIdByEmail(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  const { data, error } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  if (error) return null;
  const match = data.users.find((user) => user.email?.toLowerCase() === normalized);
  return match?.id ?? null;
}
