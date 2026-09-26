import type { NextFunction, Request, Response } from 'express';
import { supabase } from '../lib/supabaseClient.js';

export interface PermissionedRequest extends Request {
  userId: string;
}

type PermissionCheck = (userId: string, attachmentId: string) => Promise<boolean>;
type ShareRole = 'edit' | 'view';

type OwnerLookup = { status: 'not-found' } | { status: 'error' } | { status: 'ok'; ownerId: string };

// `shares` (not the superseded `permissions` table) is the source of truth —
// see agents/skills/database.md. RLS on `attachments`/`shares` doesn't help
// here: this runs under the service-role key, which bypasses RLS entirely.
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

async function hasShareRole(attachmentId: string, userId: string, roles: ShareRole[]): Promise<boolean> {
  const { data, error } = await supabase
    .from('shares')
    .select('role')
    .eq('attachment_id', attachmentId)
    .eq('grantee_user_id', userId)
    .in('role', roles)
    .limit(1);

  if (error) return false;
  return (data?.length ?? 0) > 0;
}

export async function canRead(userId: string, attachmentId: string): Promise<boolean> {
  const lookup = await getAttachmentOwner(attachmentId);
  if (lookup.status === 'error') return false;
  if (lookup.status === 'not-found') return true; // defer to the route's own 404, not a 403
  if (lookup.ownerId === userId) return true;
  return hasShareRole(attachmentId, userId, ['edit', 'view']);
}

export async function canWrite(userId: string, attachmentId: string): Promise<boolean> {
  const lookup = await getAttachmentOwner(attachmentId);
  if (lookup.status === 'error') return false;
  if (lookup.status === 'not-found') return true;
  if (lookup.ownerId === userId) return true;
  return hasShareRole(attachmentId, userId, ['edit']);
}

// The superseded `permissions` table had a separate `can_burn_in` flag; the
// reconciled `shares` table doesn't, so burn-in is gated by the same
// edit/owner check as any other write (agents/skills/database.md).
export async function canBurnIn(userId: string, attachmentId: string): Promise<boolean> {
  return canWrite(userId, attachmentId);
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function requirePermission(checkFn: PermissionCheck) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userIdHeader = req.headers['x-user-id'];
    const attachmentId = firstParam(req.params.attachmentId) ?? firstParam(req.params.id);

    if (typeof userIdHeader !== 'string' || userIdHeader.length === 0) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }
    if (!attachmentId) {
      res.status(400).json({ message: 'Missing attachment id' });
      return;
    }

    const allowed = await checkFn(userIdHeader, attachmentId);
    if (!allowed) {
      res.status(403).json({ message: 'Permission denied' });
      return;
    }

    (req as PermissionedRequest).userId = userIdHeader;
    next();
  };
}
