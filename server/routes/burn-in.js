import { Router } from 'express';
import { requirePermission, canBurnIn } from '../middleware/permissions.js';
import { applyBurnIn } from '../services/burn-in.js';

const router = Router();

// Task 3.2: body is `{ pages: [{ pageNumber, objects }] }` — the Fabric.js
// annotation JSON AnnotationCanvas.jsx's `getAnnotationsForBurnIn()` produces.
// Returns the burned PDF as base64 JSON (not a binary response) so both the
// Download flow (D1-D3, decodes it straight to a Blob) and the Save flow
// (task 3.3, forwards it unmodified to POST /api/attachments) can reuse this
// one endpoint without a separate binary-response code path in src/lib.
router.post('/:attachmentId', requirePermission(canBurnIn), async (req, res, next) => {
  try {
    const { pages } = req.body;
    if (!Array.isArray(pages)) {
      return res.status(400).json({ message: 'pages must be an array' });
    }
    const result = await applyBurnIn({ attachmentId: req.params.attachmentId, pages });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
