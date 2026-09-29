import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { PermissionedRequest } from '../middleware/permissions.js';
import { getWorkspace, updateWorkspaceDisplayName } from '../services/workspaces.js';

const router = Router();

// 4.3: mounted under `/api/workspace` in server/index.js, behind the global
// `requireAuth` gate — `req.userId` is always set by the time a handler here
// runs.
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as PermissionedRequest).userId;
    const workspace = await getWorkspace(userId);
    res.json(workspace);
  } catch (err) {
    next(err);
  }
});

// WC1: display-name-only update — there is no other mutable workspace field
// in this feature's scope.
router.patch('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as PermissionedRequest).userId;
    const { displayName } = req.body as { displayName?: unknown };
    if (typeof displayName !== 'string') {
      res.status(400).json({ message: 'displayName is required' });
      return;
    }

    const workspace = await updateWorkspaceDisplayName(userId, displayName);
    res.json(workspace);
  } catch (err) {
    next(err);
  }
});

export default router;
