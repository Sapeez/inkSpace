import { Router } from 'express';
import { requirePermission, canRead, canWrite, getAttachmentRole } from '../middleware/permissions.js';
import { saveAttachment, downloadAttachment } from '../services/storage.js';
import { validateFilename } from '../../src/utils/filenameUtils.js';
import { MAX_UPLOAD_BYTES, formatMegabytes } from '../../src/utils/uploadLimits.js';

const router = Router();

// P3/P4: `role` drives ViewerPage.jsx's tool visibility — computed here
// (rather than trusted from anywhere client-supplied) since `requirePermission`
// has already confirmed the caller has at least read access by this point.
router.get('/:id', requirePermission(canRead), async (req, res, next) => {
  try {
    const [data, role] = await Promise.all([
      downloadAttachment(req.params.id),
      getAttachmentRole(req.userId, req.params.id),
    ]);
    res.json({ ...data, role });
  } catch (err) {
    next(err);
  }
});

// Task 3.3 (Save as new attachment): always creates a *new* row — see
// `saveAttachment`'s comment. `pdfBase64` must already be burned-in (task
// 3.2's output); this route never burns in annotations itself. Filename is
// re-validated here (F4-F6) since the client-side check in SaveModal.tsx is
// UX only, not authoritative (agents/skills/backend-patterns.md "Upload &
// burn-in").
router.post('/', async (req, res, next) => {
  try {
    // 1.7: `requireAuth` (mounted ahead of every `/api` route) has already
    // verified the caller and set `req.userId` to their real `auth.users` id.
    const ownerId = req.userId;
    const { filename, pdfBase64 } = req.body;
    if (typeof filename !== 'string' || typeof pdfBase64 !== 'string') {
      return res.status(400).json({ message: 'filename and pdfBase64 are required' });
    }
    const filenameError = validateFilename(filename);
    if (filenameError) {
      return res.status(400).json({ message: filenameError });
    }
    // Task 5.3: authoritative PDF size limit — checked against the decoded
    // byte length (base64's own ~33% overhead would otherwise let a file
    // over the real limit through), before ever calling saveAttachment (no
    // point uploading to Storage only to reject it after).
    if (Buffer.byteLength(pdfBase64, 'base64') > MAX_UPLOAD_BYTES) {
      return res.status(400).json({ message: `File exceeds the ${formatMegabytes(MAX_UPLOAD_BYTES)} limit` });
    }

    const saved = await saveAttachment({ ownerId, filename, pdfBase64 });
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
