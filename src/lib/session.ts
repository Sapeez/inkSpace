import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabaseClient';

export interface SessionState {
  session: Session | null;
  loading: boolean;
}

// LG3: session persistence across reloads/tabs is handled by supabase-js
// itself (`persistSession`/`autoRefreshToken` default to `true`) — this hook
// just surfaces that state to React via `onAuthStateChange`, it doesn't
// implement persistence itself.
export function useSession(): SessionState {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let supabase;
    try {
      supabase = getSupabaseClient();
    } catch {
      setSession(null);
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!active) return;
      setSession(newSession);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}

// `src/lib/http.ts`'s `request()` isn't a component, so it can't call the
// hook above — it reads the current token directly on each request instead.
// A missing/misconfigured client is treated the same as "no session": the
// request goes out unauthenticated and the server's own `requireAuth` 401s
// it, rather than this crashing every API call.
export async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await getSupabaseClient().auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}
