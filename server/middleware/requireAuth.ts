import type { NextFunction, Request, Response } from 'express';
import { supabase } from '../lib/supabaseClient.js';
import type { PermissionedRequest } from './permissions.js';

const BEARER_PREFIX = 'Bearer ';

function extractBearerToken(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value || !value.startsWith(BEARER_PREFIX)) return null;
  const token = value.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : null;
}

// Replaces the `x-user-id` stub end-to-end (tasks-accounts-workspace.md
// 1.7): mounted ahead of every `/api` route in `server/index.js`, so
// `req.userId` is populated for every handler downstream, the same way
// `requirePermission` used to populate it from the trusted header. Verifies
// the bearer token against Supabase Auth itself (`auth.getUser`, a real
// network round-trip) rather than decoding the JWT locally, so an expired,
// revoked, or tampered token is rejected the same way regardless of how it
// was produced.
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    (req as PermissionedRequest).userId = data.user.id;
    next();
  } catch (err) {
    next(err);
  }
}
