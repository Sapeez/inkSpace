import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { PermissionedRequest } from '../middleware/permissions.js';
import { listFolders, createFolder, renameFolder, deleteFolder, moveAttachment } from '../services/folders.js';

const router = Router();

function workspaceId(req: Request): string {
  return (req as PermissionedRequest).userId;
}

// WF2: flat list of every folder in the caller's own workspace — the client
// builds the tree/breadcrumb structure from `parentFolderId`, this doesn't
// paginate or nest the response server-side.
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const folders = await listFolders(workspaceId(req));
    res.json(folders);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, parentFolderId } = req.body as { name?: unknown; parentFolderId?: unknown };
    if (typeof name !== 'string') {
      res.status(400).json({ message: 'name is required' });
      return;
    }
    if (parentFolderId !== undefined && parentFolderId !== null && typeof parentFolderId !== 'string') {
      res.status(400).json({ message: 'parentFolderId must be a string or null' });
      return;
    }

    const folder = await createFolder({
      workspaceId: workspaceId(req),
      name,
      parentFolderId: (parentFolderId as string | null | undefined) ?? null,
    });
    res.status(201).json(folder);
  } catch (err) {
    next(err);
  }
});

// WF3: move a file into a folder, or back to the top level when `folderId`
// is `null`. Declared ahead of `PATCH /:id` below so `/move-file/...` never
// matches that single-segment folder-id route instead.
router.patch('/move-file/:attachmentId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { folderId } = req.body as { folderId?: unknown };
    if (folderId !== null && typeof folderId !== 'string') {
      res.status(400).json({ message: 'folderId must be a string or null' });
      return;
    }

    await moveAttachment(workspaceId(req), req.params.attachmentId as string, folderId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = req.body as { name?: unknown };
    if (typeof name !== 'string') {
      res.status(400).json({ message: 'name is required' });
      return;
    }

    const folder = await renameFolder(workspaceId(req), req.params.id as string, name);
    res.json(folder);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await deleteFolder(workspaceId(req), req.params.id as string);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
