import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { generateDefaultFilename, validateFilename } from '../utils/filenameUtils.js';
import { MAX_UPLOAD_BYTES, formatMegabytes, estimateBase64ByteLength } from '../utils/uploadLimits.js';
import { burnInAttachment, createAttachment } from '../lib/index.js';

export interface AnnotationBurnInPage {
  pageNumber: number;
  objects: unknown[];
}

// `burnInAttachment` (src/lib/create.js) goes through `request()`, which is
// generic over an untyped-JS call site — narrow its `unknown` result here
// rather than widen `request()`'s own typing (typescript-standard.md §2.4
// "validate at the boundary").
interface BurnInResult {
  filename: string;
  mimeType: string;
  pdfBase64: string;
}

function isBurnInResult(value: unknown): value is BurnInResult {
  return typeof value === 'object' && value !== null && typeof (value as { pdfBase64?: unknown }).pdfBase64 === 'string';
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
  // Task 5.3: set only when the burned PDF exceeds MAX_UPLOAD_BYTES — a
  // distinct, specific line (like filenameError above) so the limit is
  // surfaced clearly, without changing S6's exact-text failure toast, which
  // still fires alongside it for every save failure including this one.
  const [sizeError, setSizeError] = useState<string | null>(null);

  // S2: pre-fill (per F1-F3) every time the modal opens for this attachment —
  // this component instance persists across opens/closes, so this can't be
  // one-time initial state.
  useEffect(() => {
    if (!open) return;
    setFilename(generateDefaultFilename(originalFilename));
    setFilenameError(null);
    setStatus('idle');
    setToastMessage(null);
    setSizeError(null);
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
    setSizeError(null);
    try {
      const pages = getAnnotations();
      const burnInResponse: unknown = await burnInAttachment(attachmentId, pages);
      if (!isBurnInResult(burnInResponse)) {
        throw new Error('Unexpected burn-in response shape');
      }
      const burned = burnInResponse;

      // Instant-feedback half of the size check (5.3) — the authoritative
      // check is server-side, in attachments.js's POST / — but failing here
      // avoids an upload attempt that the server would reject anyway, and
      // lets this surface a specific, clear reason rather than the generic
      // failure toast alone.
      if (estimateBase64ByteLength(burned.pdfBase64) > MAX_UPLOAD_BYTES) {
        setSizeError(`File exceeds the ${formatMegabytes(MAX_UPLOAD_BYTES)} limit — reduce the annotations and try again.`);
        setStatus('error');
        setToastMessage(`Couldn't save ${attemptedFilename}.`);
        return;
      }

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
        {sizeError && (
          <span className="save-modal-error" role="alert" data-testid="save-modal-size-error">
            {sizeError}
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
