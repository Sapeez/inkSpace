import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { generateDefaultFilename, validateFilename } from '../utils/filenameUtils.js';
import { burnInAttachment, createAttachment } from '../lib/index.js';

export interface AnnotationBurnInPage {
  pageNumber: number;
  objects: unknown[];
}

interface SaveModalProps {
  open: boolean;
  attachmentId: string;
  originalFilename: string;
  onClose: () => void;
  getAnnotations: () => AnnotationBurnInPage[];
}

type SaveStatus = 'idle' | 'saving' | 'success' | 'error';

// S1-S9/F1-F6: the "Save attachment" modal. Owns its own filename/validation/
// save-in-flight state end to end (burn-in, then persist) — mirrors
// SignatureUploader.tsx's pattern of a component that owns a whole async
// action rather than splitting it across itself and its parent.
export default function SaveModal({ open, attachmentId, originalFilename, onClose, getAnnotations }: SaveModalProps) {
  const [filename, setFilename] = useState('');
  const [filenameError, setFilenameError] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // S2: pre-fill (per F1-F3) every time the modal opens for this attachment —
  // this component instance persists across opens/closes, so this can't be
  // one-time initial state.
  useEffect(() => {
    if (!open) return;
    setFilename(generateDefaultFilename(originalFilename));
    setFilenameError(null);
    setStatus('idle');
    setToastMessage(null);
  }, [open, originalFilename]);

  if (!open) return null;

  const saving = status === 'saving';

  function handleFilenameChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setFilename(value);
    setFilenameError(validateFilename(value));
  }

  async function handleConfirm() {
    // Defense-in-depth against a double-click/double-Enter landing before
    // React commits the confirm button's `disabled` state — without this, a
    // fast double-submit could kick off two concurrent burn-in→save round
    // trips (two duplicate saved attachments, plus a race on which
    // `setToastMessage` call wins).
    if (saving) return;

    const error = validateFilename(filename);
    setFilenameError(error);
    if (error) return;

    // Captured now, not read again after the async work below — S6/S7's
    // toast must name the file this specific attempt tried to save under,
    // even if the input's value has since changed (the field is disabled
    // while saving, but this keeps the message correct regardless).
    const attemptedFilename = filename;

    setStatus('saving');
    setToastMessage(null);
    try {
      const pages = getAnnotations();
      const burned = await burnInAttachment(attachmentId, pages);
      await createAttachment({ filename: attemptedFilename, pdfBase64: burned.pdfBase64 });
      setStatus('success');
      setToastMessage(`${attemptedFilename} saved successfully to workspace.`);
    } catch {
      setStatus('error');
      setToastMessage(`Couldn't save ${attemptedFilename}.`);
    }
  }

  // S5: Cancel and the "X" close control are disabled while saving, not just
  // functionally inert — the `disabled` attribute below also drives the
  // visible style (global.css's `.save-modal-*:disabled` rules).
  function handleCloseOrCancel() {
    if (saving) return;
    onClose();
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="save-modal-title" data-testid="save-modal">
      <div className="modal save-modal">
        <div className="save-modal-header">
          <h2 id="save-modal-title">Save attachment</h2>
          <button
            type="button"
            className="save-modal-close-button"
            onClick={handleCloseOrCancel}
            disabled={saving}
            aria-label="Close"
            data-testid="save-modal-close-button"
          >
            ×
          </button>
        </div>

        <label className="save-modal-field">
          <span className="save-modal-label">Filename</span>
          <input
            type="text"
            className="save-modal-filename-input"
            value={filename}
            onChange={handleFilenameChange}
            disabled={saving}
            data-testid="save-modal-filename-input"
          />
        </label>
        {filenameError && (
          <span className="save-modal-error" role="alert" data-testid="filename-validation-error">
            {filenameError}
          </span>
        )}

        {saving && (
          <span className="save-modal-progress" role="status" data-testid="save-progress-indicator">
            Saving…
          </span>
        )}
        {status === 'success' && toastMessage && (
          <span className="save-modal-toast save-modal-toast--success" role="status" data-testid="success-toast">
            {toastMessage}
          </span>
        )}
        {status === 'error' && toastMessage && (
          <span className="save-modal-toast save-modal-toast--error" role="alert" data-testid="error-toast">
            {toastMessage}
          </span>
        )}

        <div className="modal-actions">
          <button
            type="button"
            className="save-modal-cancel-button"
            onClick={handleCloseOrCancel}
            disabled={saving}
            data-testid="save-modal-cancel-button"
          >
            Cancel
          </button>
          <button
            type="button"
            className="save-modal-confirm-button"
            onClick={handleConfirm}
            disabled={saving || Boolean(filenameError)}
            data-testid="save-modal-confirm-button"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
