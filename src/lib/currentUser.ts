// Client-side half of the repo-wide `x-user-id` identity stub (see
// `agents/skills/backend-patterns.md` and spec.md §4's gap note) — there is
// no login flow yet, so this is the only way a browser session can identify
// itself to the server's `requirePermission` middleware. Backed by
// localStorage so a manual tester can act as different users (owner vs.
// share recipient) across tabs/reloads without a real auth system. Replaced
// wholesale once `requireAuth`/a verified Supabase JWT lands
// (tasks-accounts-workspace.md task 1.6) — nothing here should be extended.
const STORAGE_KEY = 'inkspace.devUserId';

export function getCurrentUserId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setCurrentUserId(userId: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, userId);
}
