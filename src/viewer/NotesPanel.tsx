import { useState } from 'react';
import type { ChangeEvent } from 'react';

interface Note {
  id: string;
  text: string;
}

// P3/P4: the *only* notes affordance in the product, and only for view-only
// sessions — editors get the full annotation toolbar instead, never a notes
// tool (code-review.md §4.9 out-of-scope list). Deliberately not wired into
// burn-in/save: those endpoints require `edit` (canWrite/canBurnIn), which a
// view-only session never has, so notes are session-only/local to this tab,
// not a persisted annotation. No notes backend exists in this task list —
// if that changes, this is the component to wire persistence into.
export default function NotesPanel() {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState('');

  function handleDraftChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setDraft(event.target.value);
  }

  function handleAddNote() {
    const text = draft.trim();
    if (!text) return;
    setNotes((current) => [...current, { id: crypto.randomUUID(), text }]);
    setDraft('');
  }

  function handleRemoveNote(id: string) {
    setNotes((current) => current.filter((note) => note.id !== id));
  }

  return (
    <div className="notes-panel-container">
      <button
        type="button"
        className="toolbar-action-button"
        aria-pressed={open}
        onClick={() => setOpen((value) => !value)}
        data-testid="notes-button"
      >
        Notes
      </button>
      {open && (
        <div className="notes-panel" data-testid="notes-panel">
          <textarea
            className="notes-panel-input"
            value={draft}
            onChange={handleDraftChange}
            placeholder="Add a personal note (visible only to you, not saved to the file)"
            data-testid="notes-panel-input"
          />
          <button type="button" className="notes-panel-add-button" onClick={handleAddNote} data-testid="notes-panel-add-button">
            Add note
          </button>
          <ul className="notes-panel-list">
            {notes.map((note) => (
              <li className="notes-panel-item" key={note.id} data-testid="notes-panel-item">
                <span>{note.text}</span>
                <button type="button" onClick={() => handleRemoveNote(note.id)} aria-label="Remove note">
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
