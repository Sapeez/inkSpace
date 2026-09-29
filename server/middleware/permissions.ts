import type { NextFunction, Request, Response } from 'express';
import { supabase } from '../lib/supabaseClient.js';

export interface PermissionedRequest extends Request {
  userId: string;
}

type PermissionCheck = (userId: string, attachmentId: string) => Promise<boolean>;

type OwnerLookup = { status: 'not-found' } | { status: 'error' } | { status: 'ok'; ownerId: string };

// 7.3: cross-account sharing is cut entirely (tasks-accounts-workspace.md
// §3.4/WF5) — an attachment now has exactly one caller who can ever reach
// it, its owner. There is no more `shares` table to consult.
async function getAttachmentOwner(attachmentId: string): Promise<OwnerLookup> {
  const { data, error } = await supabase
    .from('attachments')
    .select('owner_id')
    .eq('id', attachmentId)
    .maybeSingle();

  if (error) return { status: 'error' };
  if (!data) return { status: 'not-found' };
  return { status: 'ok', ownerId: (data as { owner_id: string }).owner_id };
}

// `canRead`/`canWrite` are both owner-only now (identical bodies) — kept as
// separate named checks since call sites (attachments.js/burn-in.js) still
// read as "read access" vs. "write access", even though this single-owner
// model makes them behave the same.
export async function canRead(userId: string, attachmentId: string): Promise<boolean> {
  const lookup = await getAttachmentOwner(attachmentId);
  if (lookup.status === 'error') return false;
  if (lookup.status === 'not-found') return true; // defer to the route's own 404, not a 403
  return lookup.ownerId === userId;
}

export async function canWrite(userId: string, attachmentId: string): Promise<boolean> {
  return canRead(userId, attachmentId);
}

export async function canBurnIn(userId: string, attachmentId: string): Promise<boolean> {
  return canWrite(userId, attachmentId);
}

// Fails closed (not "defer to the route's own 404") — used by routes with no
// follow-up lookup of their own that would turn a false-open into a correct
// 404, e.g. DELETE /api/attachments/:id.
export async function isOwner(userId: string, attachmentId: string): Promise<boolean> {
  const lookup = await getAttachmentOwner(attachmentId);
  if (lookup.status !== 'ok') return false;
  return lookup.ownerId === userId;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// 1.7: identity comes only from `req.userId`, set by `requireAuth` (a
// verified Supabase JWT) mounted ahead of every `/api` route in
// `server/index.js` — this no longer reads any client-supplied header itself.
export function requirePermission(checkFn: PermissionCheck) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = (req as PermissionedRequest).userId;
    const attachmentId = firstParam(req.params.attachmentId) ?? firstParam(req.params.id);

    // Found in review: today this is only ever unset if a route reaches here
    // without `requireAuth` having run first, which shouldn't happen given
    // `server/index.js`'s mount order — but that safety would otherwise live
    // entirely in mount ordering, not in this chokepoint itself. Guarding it
    // here too means a future misordered router fails with a diagnostic 401
    // instead of silently falling through to `checkFn(undefined, ...)`.
    if (!userId) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }
    if (!attachmentId) {
      res.status(400).json({ message: 'Missing attachment id' });
      return;
    }

    const allowed = await checkFn(userId, attachmentId);
    if (!allowed) {
      res.status(403).json({ message: 'Permission denied' });
      return;
    }

    next();
  };
}
