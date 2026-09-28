import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { createShare, fetchShares, removeShare } from '../lib/index.js';

export interface Share {
  id: string;
  granteeEmail: string;
  role: 'edit' | 'view';
}

// Mirrors usePdfDocument.ts's isAttachmentDownload — validates the server
// response shape rather than trusting a bare `as Share` cast.
function isShare(value: unknown): value is Share {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.granteeEmail === 'string' &&
    (candidate.role === 'edit' || candidate.role === 'view')
  );
}

interface ShareModalProps {
  open: boolean;
  attachmentId: string;
  onClose: () => void;
}

// P1: owner-only modal — type an email, pick edit|view, submit; lists and
// can revoke existing shares. Owner-only is enforced server-side
// (`isOwner` in permissions.ts) — this modal is only ever opened for an
// owner (ViewerPage.jsx gates the Share button itself), but the server
// check is what actually matters (code-review.md §4.3).
export default function ShareModal({ open, attachmentId, onClose }: ShareModalProps) {
  const [shares, setShares] = useState<Share[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'edit' | 'view'>('view');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setEmail('');
    setRole('view');
    setFormError(null);
    setListError(null);

    let cancelled = false;
    (async () => {
      try {
        const data: unknown = await fetchShares(attachmentId);
        if (cancelled) return;
        if (!Array.isArray(data) || !data.every(isShare)) {
          throw new Error('Malformed shares response');
        }
        setShares(data);
      } catch (err) {
        if (!cancelled) setListError(err instanceof Error ? err.message : 'Failed to load shares');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, attachmentId]);

  if (!open) return null;

  function handleEmailChange(event: ChangeEvent<HTMLInputElement>) {
    setEmail(event.target.value);
  }

  function handleRoleChange(event: ChangeEvent<HTMLSelectElement>) {
    setRole(event.target.value as 'edit' | 'view');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setFormError(null);
    try {
      const share: unknown = await createShare(attachmentId, { email, role });
      if (!isShare(share)) {
        throw new Error('Malformed share response');
      }
      setShares((current) => [share, ...current.filter((s) => s.granteeEmail !== share.granteeEmail)]);
      setEmail('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to share attachment');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(shareId: string) {
    try {
      await removeShare(attachmentId, shareId);
      setShares((current) => current.filter((s) => s.id !== shareId));
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to revoke access');
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="share-modal-title" data-testid="share-modal">
      <div className="modal share-modal">
        <div className="share-modal-header">
          <h2 id="share-modal-title">Share</h2>
          <button
            type="button"
            className="share-modal-close-button"
            onClick={onClose}
            aria-label="Close"
            data-testid="share-modal-close-button"
          >
            ×
          </button>
        </div>

        <form className="share-modal-form" onSubmit={handleSubmit}>
          <label className="share-modal-field">
            <span className="share-modal-label">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={handleEmailChange}
              disabled={submitting}
              data-testid="share-email-input"
            />
          </label>
          <label className="share-modal-field">
            <span className="share-modal-label">Access</span>
            <select
              value={role}
              onChange={handleRoleChange}
              disabled={submitting}
              data-testid="share-role-select"
            >
              <option value="view">Can view</option>
              <option value="edit">Can edit</option>
            </select>
          </label>
          {formError && (
            <span className="share-modal-error" role="alert" data-testid="share-form-error">
              {formError}
            </span>
          )}
          <button
            type="submit"
            className="share-modal-confirm-button"
            disabled={submitting}
            data-testid="share-confirm-button"
          >
            {submitting ? 'Sharing…' : 'Share'}
          </button>
        </form>

        <div className="share-modal-list" data-testid="share-list">
          {listError && (
            <span className="share-modal-error" role="alert" data-testid="share-list-error">
              {listError}
            </span>
          )}
          {shares.length === 0 && !listError && <p className="share-modal-empty">Not shared with anyone yet.</p>}
          {shares.map((share) => (
            <div className="share-modal-list-item" key={share.id} data-testid="share-list-item">
              <span className="share-modal-list-email">{share.granteeEmail}</span>
              <span className="share-modal-list-role">{share.role === 'edit' ? 'Can edit' : 'Can view'}</span>
              <button
                type="button"
                className="share-modal-revoke-button"
                onClick={() => handleRevoke(share.id)}
                data-testid="share-revoke-button"
              >
                Revoke
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
