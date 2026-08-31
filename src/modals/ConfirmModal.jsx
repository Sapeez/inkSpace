export default function ConfirmModal({ open, title, message, onConfirm, onCancel }) {
  if (!open) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal">
        <h2 id="modal-title">{title}</h2>
        <p>{message}</p>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  );
}
