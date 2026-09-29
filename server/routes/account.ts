import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { PermissionedRequest } from '../middleware/permissions.js';
import { deleteAccountCascade } from '../services/account.js';

const router = Router();

// US5/R2: mounted under `/api/account` behind the global `requireAuth` gate
// (server/index.js) — there is no `:id` param, a caller can only ever
// delete their own account, identified by `req.userId`.
router.delete('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as PermissionedRequest).userId;
    await deleteAccountCascade(userId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
