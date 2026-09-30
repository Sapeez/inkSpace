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
}) {
  if (!open) return null;

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
