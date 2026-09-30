// data-testid props are all optional so every existing/future caller of this
// generic modal can opt into stable per-instance test ids (e.g. the delete-
// annotation confirmation, requirement A6) without this component having to
// know about any specific caller's use case. `disabled`/`error` are likewise
// optional (default to inert) so an in-flight, potentially-failing confirm
// action (e.g. the delete-account flow) can disable Confirm/Cancel *visibly*
// while the action runs and surface a failure without auto-closing — the
// same §4.8 "disabled visibly, stay open on failure" pattern SaveModal.tsx
// already follows — without changing behavior for a caller that never
// passes them (a fire-and-forget confirm like delete-annotation).
// `confirmDisabled` overrides `disabled` for the Confirm button only,
// falling back to `disabled` when unset — for a caller that needs Confirm
// gated on something Cancel shouldn't be blocked by (e.g. a parent page's
// delete-workspace confirmation, gated on a background counts fetch the user
// should still be able to back out of immediately).
// `variant="card"` is the compact card redesign (heading, description, an
// exit X, Cancel + a caller-labelled primary button); `confirmLabel` only
// applies there so every default-variant caller keeps its "Confirm" text.
export default function ConfirmModal({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  disabled = false,
  confirmDisabled = disabled,
  error,
  testId,
  titleTestId,
  messageTestId,
  confirmTestId,
  cancelTestId,
  errorTestId,
  variant = 'default',
  confirmLabel = 'Confirm',
}) {
  if (!open) return null;

  if (variant === 'card') {
    return (
      <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title" data-testid={testId}>
        <div className="card-modal">
          <div className="card-modal-content">
            <h2 id="modal-title" className="card-modal-heading" data-testid={titleTestId}>{title}</h2>
            <p className="card-modal-description" data-testid={messageTestId}>{message}</p>
            {error && (
              <p className="modal-error" role="alert" data-testid={errorTestId}>
                {error}
              </p>
            )}
          </div>
          <div className="card-modal-buttons">
            <button type="button" className="card-modal-button card-modal-button--secondary" onClick={onCancel} disabled={disabled} data-testid={cancelTestId}>
              Cancel
            </button>
            <button type="button" className="card-modal-button card-modal-button--primary" onClick={onConfirm} disabled={confirmDisabled} data-testid={confirmTestId}>
              {confirmLabel}
            </button>
          </div>
          <button type="button" className="card-modal-exit" aria-label="Close" onClick={onCancel} disabled={disabled}>
            <svg height="20px" viewBox="0 0 384 512" aria-hidden="true">
              <path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title" data-testid={testId}>
      <div className="modal">
        <h2 id="modal-title" data-testid={titleTestId}>{title}</h2>
        <p data-testid={messageTestId}>{message}</p>
        {error && (
          <p className="modal-error" role="alert" data-testid={errorTestId}>
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" onClick={onCancel} disabled={disabled} data-testid={cancelTestId}>Cancel</button>
          <button type="button" onClick={onConfirm} disabled={confirmDisabled} data-testid={confirmTestId}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
