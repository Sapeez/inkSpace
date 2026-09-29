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

// 7.3/7.4: cross-account sharing (and the edit/view/owner role split it
// required) is cut entirely — every caller who can reach a file is its
// owner, so there's a single always-editable toolbar now, not a role
// switch. No Share button, no view-only Notes substitute.
export default function Toolbar({
  attachmentId,
  activeTool,
  onToolChange,
  style,
  onStyleChange,
  onSignaturePlace,
  onDownload,
  downloading,
  downloadError,
  onSaveClick,
}) {
  return (
    <header className="toolbar" role="group" aria-label="Toolbar" data-testid="toolbar">
      <span className="toolbar-attachment">Attachment: {attachmentId}</span>
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
      <StyleControls style={style} onStyleChange={onStyleChange} />
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
        <button type="button" className="toolbar-action-button" data-testid="save-button" onClick={onSaveClick}>
          Save
        </button>
      </div>
    </header>
  );
}
