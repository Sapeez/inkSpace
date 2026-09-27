// data-testid props are all optional so every existing/future caller of this
// generic modal can opt into stable per-instance test ids (e.g. the delete-
// annotation confirmation, requirement A6) without this component having to
// know about any specific caller's use case.
export default function ConfirmModal({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  testId,
  titleTestId,
  messageTestId,
  confirmTestId,
  cancelTestId,
}) {
  if (!open) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title" data-testid={testId}>
      <div className="modal">
        <h2 id="modal-title" data-testid={titleTestId}>{title}</h2>
        <p data-testid={messageTestId}>{message}</p>
        <div className="modal-actions">
          <button type="button" onClick={onCancel} data-testid={cancelTestId}>Cancel</button>
          <button type="button" onClick={onConfirm} data-testid={confirmTestId}>Confirm</button>
        </div>
      </div>
    </div>
  );
}
