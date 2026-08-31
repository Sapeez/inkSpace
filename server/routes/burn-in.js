import { Router } from 'express';
import { requirePermission, canBurnIn } from '../middleware/permissions.js';
import { applyBurnIn } from '../services/burn-in.js';

const router = Router();

router.post('/:attachmentId', requirePermission(canBurnIn), async (req, res, next) => {
  try {
    const result = await applyBurnIn({
      attachmentId: req.params.attachmentId,
      timestamp: req.body.timestamp,
      watermarkText: req.body.watermarkText,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
