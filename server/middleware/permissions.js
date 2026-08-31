/**
 * Permission checks — PRD §3.2
 * Verify user access before read/write/burn-in operations.
 */

export async function canRead(_userId, _attachmentId) {
  // TODO: query supabase permissions table
  return true;
}

export async function canWrite(_userId, _attachmentId) {
  // TODO: query supabase permissions table
  return true;
}

export async function canBurnIn(_userId, _attachmentId) {
  // TODO: require write + burn_in flag on permission row
  return true;
}

export function requirePermission(checkFn) {
  return async (req, res, next) => {
    const userId = req.headers['x-user-id'];
    const attachmentId = req.params.attachmentId ?? req.params.id;

    if (!userId) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const allowed = await checkFn(userId, attachmentId);
    if (!allowed) {
      return res.status(403).json({ message: 'Permission denied' });
    }

    req.userId = userId;
    next();
  };
}
