import {
  PenIcon,
  FreeformHighlighterIcon,
  TextIcon,
  TextHighlighterIcon,
  EllipseIcon,
  RectangleIcon,
  LineIcon,
  ArrowIcon,
  CloudIcon,
  PolygonIcon,
} from './toolbarIcons.tsx';
import StyleControls from './StyleControls.tsx';
import SignatureUploader from '../annotation-canvas/SignatureUploader.tsx';
import NotesPanel from '../viewer/NotesPanel.tsx';

// Fixed left-to-right order per requirement A1 — do not reorder. Ellipse is
// the default *shape* tool (Rectangle/Line/Arrow are its siblings, not
// separate defaults), but every tool is its own always-visible button here,
// not a collapsed group; only Pen is the toolbar's overall default on mount.
// Signature (last) isn't in this list — unlike every tool here, it isn't a
// canvas-gesture mode tracked via `activeTool`, so it's rendered separately
// below via SignatureUploader.tsx, right after this list, to keep its
// required toolbar position (A1) without forcing it into this shape.
const TOOLS = [
  { id: 'pen', label: 'Pen', testId: 'tool-pen', Icon: PenIcon },
  { id: 'freeform-highlighter', label: 'Freeform Highlighter', testId: 'tool-freeform-highlighter', Icon: FreeformHighlighterIcon },
  { id: 'text', label: 'Text', testId: 'tool-text', Icon: TextIcon },
  { id: 'text-highlighter', label: 'Text Highlighter', testId: 'tool-text-highlighter', Icon: TextHighlighterIcon },
  { id: 'ellipse', label: 'Ellipse', testId: 'tool-ellipse', Icon: EllipseIcon },
  { id: 'rectangle', label: 'Rectangle', testId: 'tool-rectangle', Icon: RectangleIcon },
  { id: 'line', label: 'Line', testId: 'tool-line', Icon: LineIcon },
  { id: 'arrow', label: 'Arrow', testId: 'tool-arrow', Icon: ArrowIcon },
  { id: 'cloud', label: 'Cloud', testId: 'tool-cloud', Icon: CloudIcon },
  { id: 'polygon', label: 'Polygon', testId: 'tool-polygon', Icon: PolygonIcon },
];

// P3/P4: `role` (owner|edit|view, from ViewerPage.jsx's usePdfDocument
// attachment fetch) gates the annotation tools, style controls, and Save
// button — view-only sessions get the Notes control (NotesPanel.tsx)
// instead. `role` defaults to editable (`undefined` !== 'view') so existing
// callers that don't pass it yet (tests/Annotator.test.tsx's Harness) keep
// today's full-toolbar behavior; this is purely a display gate — the
// server independently rejects any edit/save/burn-in a view-only caller
// attempts directly (code-review.md §4.3).
export default function Toolbar({
  attachmentId,
  role,
  activeTool,
  onToolChange,
  style,
  onStyleChange,
  onSignaturePlace,
  onDownload,
  downloading,
  downloadError,
  onSaveClick,
  onShareClick,
}) {
  const canEdit = role !== 'view';
  const isOwner = role === 'owner';

  return (
    <header className="toolbar" role="group" aria-label="Toolbar" data-testid="toolbar">
      <span className="toolbar-attachment">Attachment: {attachmentId}</span>
      {canEdit && (
        <div className="toolbar-tools" role="toolbar" aria-label="Annotation tools" data-testid="annotation-toolbar">
          {TOOLS.map(({ id, label, testId, Icon }) => (
            <button
              key={id}
              type="button"
              className="toolbar-tool-button"
              data-testid={testId}
              aria-label={label}
              aria-pressed={activeTool === id}
              onClick={() => onToolChange(id)}
            >
              <Icon />
            </button>
          ))}
          <SignatureUploader onPlace={onSignaturePlace} />
        </div>
      )}
      {canEdit && <StyleControls style={style} onStyleChange={onStyleChange} />}
      <div className="toolbar-actions">
        {downloadError && (
          <span className="toolbar-action-error" role="alert" data-testid="download-error">
            {downloadError}
          </span>
        )}
        <button
          type="button"
          className="toolbar-action-button"
          data-testid="download-button"
          onClick={onDownload}
          disabled={downloading}
        >
          {downloading ? 'Downloading…' : 'Download'}
        </button>
        {canEdit && (
          <button type="button" className="toolbar-action-button" data-testid="save-button" onClick={onSaveClick}>
            Save
          </button>
        )}
        {isOwner && (
          <button type="button" className="toolbar-action-button" data-testid="share-button" onClick={onShareClick}>
            Share
          </button>
        )}
        {!canEdit && <NotesPanel />}
      </div>
    </header>
  );
}
