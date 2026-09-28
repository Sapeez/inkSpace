import { Router } from 'express';
import type { Request } from 'express';
import { requirePermission, isOwner, type PermissionedRequest } from '../middleware/permissions.js';
import { listShares, createShare, removeShare, type Share } from '../services/shares.js';

// P1/4.4: mounted at `/api/attachments/:attachmentId/shares` (mergeParams so
// this router sees the parent's `:attachmentId`) — owner-only grant/list/
// revoke of edit|view access by email. Every route here goes through
// `requirePermission(isOwner)` first (4.3's chokepoint), same as
// attachments.js and burn-in.js.
const router = Router({ mergeParams: true });

const VALID_ROLES = ['edit', 'view'];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function attachmentIdOf(req: Request): string {
  return req.params.attachmentId as string;
}

// Found in review: `Share` (services/shares.ts) carries `granteeUserId`/
// `grantedBy` — real `auth.users` UUIDs. Given identity here is still the
// `x-user-id` header stub (permissions.ts), leaking another user's UUID to
// the browser is not cosmetic — anyone who reads it out of this response can
// set it as their own `x-user-id` (src/lib/currentUser.ts) and be treated as
// that user on every other route. Never send `Share` itself to the client;
// only this narrowed shape, which the owner already has enough context to
// use (their own request, an email they typed, and the role they picked).
interface ClientShare {
  id: string;
  granteeEmail: string;
  role: Share['role'];
  grantedAt: string;
}

function toClientShare(share: Share): ClientShare {
  return { id: share.id, granteeEmail: share.granteeEmail, role: share.role, grantedAt: share.grantedAt };
}

router.get('/', requirePermission(isOwner), async (req, res, next) => {
  try {
    const shares = await listShares(attachmentIdOf(req));
    res.json(shares.map(toClientShare));
  } catch (err) {
    next(err);
  }
});

router.post('/', requirePermission(isOwner), async (req, res, next) => {
  try {
    const { email, role } = req.body;
    if (typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
      res.status(400).json({ message: 'A valid email address is required' });
      return;
    }
    if (typeof role !== 'string' || !VALID_ROLES.includes(role)) {
      res.status(400).json({ message: "role must be 'edit' or 'view'" });
      return;
    }

    const share = await createShare({
      attachmentId: attachmentIdOf(req),
      email,
      role: role as 'edit' | 'view',
      grantedBy: (req as PermissionedRequest).userId,
    });
    res.status(201).json(toClientShare(share));
  } catch (err) {
    next(err);
  }
});

router.delete('/:shareId', requirePermission(isOwner), async (req, res, next) => {
  try {
    await removeShare(attachmentIdOf(req), req.params.shareId as string);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
