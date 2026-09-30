import {
  HandIcon,
  PenIcon,
  FreeformHighlighterIcon,
  TextIcon,
  EllipseIcon,
  RectangleIcon,
  LineIcon,
  ArrowIcon,
  CloudIcon,
  SaveIcon,
  DownloadIcon,
  DocumentEditorIcon,
} from './toolbarIcons.tsx';
import StyleControls from './StyleControls.tsx';
import SignatureUploader from '../annotation-canvas/SignatureUploader.tsx';

// Fixed left-to-right order per requirement A1 — do not reorder. Hand (select/move/resize existing
// annotations, draws nothing) is first and has no style popover. Ellipse is
// the default *shape* tool (Rectangle/Line/Arrow are its siblings, not
// separate defaults), but every tool is its own always-visible button here,
// not a collapsed group; only Pen is the toolbar's overall default on mount.
// Signature (last) isn't in this list — unlike every tool here, it isn't a
// canvas-gesture mode tracked via `activeTool`, so it's rendered separately
// below via SignatureUploader.tsx, right after this list, to keep its
// required toolbar position (A1) without forcing it into this shape.
const TOOLS = [
  { id: 'hand', label: 'Hand', testId: 'tool-hand', Icon: HandIcon },
  { id: 'pen', label: 'Pen', testId: 'tool-pen', Icon: PenIcon },
  { id: 'freeform-highlighter', label: 'Freeform Highlighter', testId: 'tool-freeform-highlighter', Icon: FreeformHighlighterIcon },
  { id: 'text', label: 'Text', testId: 'tool-text', Icon: TextIcon },
  { id: 'ellipse', label: 'Ellipse', testId: 'tool-ellipse', Icon: EllipseIcon },
  { id: 'rectangle', label: 'Rectangle', testId: 'tool-rectangle', Icon: RectangleIcon },
  { id: 'line', label: 'Line', testId: 'tool-line', Icon: LineIcon },
  { id: 'arrow', label: 'Arrow', testId: 'tool-arrow', Icon: ArrowIcon },
  { id: 'cloud', label: 'Cloud', testId: 'tool-cloud', Icon: CloudIcon },
];

// Closed shapes can be filled.
const FILLABLE_TOOLS = new Set(['rectangle', 'ellipse', 'cloud']);

// Text has no stroke, so its style popover is color only.
const NO_STROKE_WIDTH_TOOLS = new Set(['text']);

const DRAFT_STATUS_TEXT = {
  saving: 'Saving draft…',
  saved: 'Draft saved',
  error: "Couldn't save draft — retrying",
};

// 7.3/7.4: cross-account sharing (and the edit/view/owner role split it
// required) is cut entirely — every caller who can reach a file is its
// owner, so there's a single always-editable toolbar now, not a role
// switch. No Share button, no view-only Notes substitute.
export default function Toolbar({
  attachmentName,
  onBack,
  draftStatus = 'idle',
  activeTool,
  onToolChange,
  style,
  onStyleChange,
  onSignaturePlace,
  onDownload,
  downloading,
  downloadError,
  onSaveClick,
  onDocumentEditor = /** @type {(() => void) | undefined} */ (undefined),
}) {
  return (
    <header className="toolbar" role="group" aria-label="Toolbar" data-testid="toolbar">
      <span className="toolbar-attachment" title={attachmentName} data-testid="toolbar-attachment-name">
        {attachmentName}
      </span>
      <div className="toolbar-tools" role="toolbar" aria-label="Annotation tools" data-testid="annotation-toolbar">
        {TOOLS.map(({ id, label, testId, Icon }) => (
          <div key={id} className="toolbar-tool-slot">
            <button
              type="button"
              className="toolbar-tool-button"
              data-testid={testId}
              aria-label={label}
              aria-pressed={activeTool === id}
              onClick={() => onToolChange(id)}
            >
              <Icon />
              <span className="file-button-tooltip">{label}</span>
            </button>
            {activeTool === id && id !== 'hand' && (
              <div className="toolbar-style-popover" role="group" aria-label={`${label} style`} data-testid="annotation-style-popover">
                <StyleControls
                  style={style}
                  onStyleChange={onStyleChange}
                  showStrokeWidth={!NO_STROKE_WIDTH_TOOLS.has(id)}
                  showFill={FILLABLE_TOOLS.has(id)}
                  showFont={id === 'text'}
                />
              </div>
            )}
          </div>
        ))}
        <SignatureUploader onPlace={onSignaturePlace} />
        {onDocumentEditor && (
          <div className="toolbar-tool-slot">
            <button
              type="button"
              className="toolbar-tool-button"
              data-testid="document-editor-button"
              aria-label="Document editor"
              onClick={onDocumentEditor}
            >
              <DocumentEditorIcon />
              <span className="file-button-tooltip">Document editor</span>
            </button>
          </div>
        )}
      </div>
      <div className="toolbar-actions">
        {draftStatus && DRAFT_STATUS_TEXT[draftStatus] && (
          <span
            className={`toolbar-draft-status${draftStatus === 'error' ? ' toolbar-draft-status--error' : ''}`}
            role="status"
            data-testid="draft-status"
          >
            {DRAFT_STATUS_TEXT[draftStatus]}
          </span>
        )}
        {downloadError && (
          <span className="toolbar-action-error" role="alert" data-testid="download-error">
            {downloadError}
          </span>
        )}
        <button
          type="button"
          className="toolbar-action-button toolbar-action-button--icon"
          data-testid="download-button"
          aria-label={downloading ? 'Downloading…' : 'Download'}
          title={downloading ? 'Downloading…' : 'Download'}
          onClick={onDownload}
          disabled={downloading}
        >
          <DownloadIcon />
        </button>
        <button
          type="button"
          className="toolbar-action-button toolbar-action-button--icon"
          data-testid="save-button"
          aria-label="Save"
          title="Save"
          onClick={onSaveClick}
        >
          <SaveIcon />
        </button>
      </div>
      <button type="button" className="toolbar-back-button" data-testid="back-button" aria-label="Back" title="Back" onClick={onBack}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </header>
  );
}
