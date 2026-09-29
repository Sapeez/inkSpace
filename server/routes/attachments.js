import { Router } from 'express';
import { requirePermission, canRead, canWrite, isOwner } from '../middleware/permissions.js';
import { saveAttachment, downloadAttachment, listAttachments, deleteAttachment } from '../services/storage.js';
import { validateFilename } from '../../src/utils/filenameUtils.js';
import { MAX_UPLOAD_BYTES, formatMegabytes } from '../../src/utils/uploadLimits.js';

const router = Router();

// WF1/4.6: scoped to `req.userId` unconditionally — there is no
// cross-account listing path, and no share-based listing either (WF5: no
// grant model for folders/workspace browsing, unlike the per-file `shares`
// table). `?folderId=<uuid>` scopes to one folder, `?folderId=root` to the
// top level only, and omitting it returns every attachment in the caller's
// own workspace (used by Recent/search, WF7/WF11).
router.get('/', async (req, res, next) => {
  try {
    const { folderId } = req.query;
    const attachments = await listAttachments(req.userId, typeof folderId === 'string' ? folderId : undefined);
    res.json(attachments);
  } catch (err) {
    next(err);
  }
});

// 7.3/7.4: single-owner model — `requirePermission(canRead)` has already
// confirmed the caller owns this attachment, so there's no per-caller role
// left to compute or return.
router.get('/:id', requirePermission(canRead), async (req, res, next) => {
  try {
    const data = await downloadAttachment(req.params.id);
    res.json(data);
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

// WF9: owner-only, not `canWrite` — `isOwner` fails closed (403) rather than
// deferring to the route's own 404, since there's no follow-up lookup here.
router.delete('/:id', requirePermission(isOwner), async (req, res, next) => {
  try {
    await deleteAttachment(req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
