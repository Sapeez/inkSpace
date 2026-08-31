import { Router } from 'express';
import { requirePermission, canRead, canWrite } from '../middleware/permissions.js';
import { saveAttachment, downloadAttachment } from '../services/storage.js';

const router = Router();

router.get('/:id', requirePermission(canRead), async (req, res, next) => {
  try {
    const data = await downloadAttachment(req.params.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    if (!req.headers['x-user-id']) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const saved = await saveAttachment(req.body);
    res.status(201).json(saved);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', requirePermission(canWrite), async (_req, res) => {
  res.status(501).json({ message: 'Not implemented' });
});

router.delete('/:id', requirePermission(canWrite), async (_req, res) => {
  res.status(501).json({ message: 'Not implemented' });
});

export default router;
