import { request } from './http';

// US5/R2/3.6: a real, immediate, server-side cascading delete
// (server/services/account.ts) — there is no separate "confirm via email"
// step or undo window (§3.4 out-of-scope: no soft/reversible deletion).
export async function deleteAccount(): Promise<void> {
  await request('/api/account', { method: 'DELETE' });
}
