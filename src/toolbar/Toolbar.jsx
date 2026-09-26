import { useState } from 'react';
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
  SignatureIcon,
} from './toolbarIcons.tsx';

// Fixed left-to-right order per requirement A1 — do not reorder. Ellipse is
// the default *shape* tool (Rectangle/Line/Arrow are its siblings, not
// separate defaults), but every tool is its own always-visible button here,
// not a collapsed group; only Pen is the toolbar's overall default on mount.
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
  { id: 'signature', label: 'Signature', testId: 'tool-signature', Icon: SignatureIcon },
];

export default function Toolbar({ attachmentId }) {
  const [activeTool, setActiveTool] = useState('pen');

  return (
    <header className="toolbar" role="toolbar" aria-label="Annotation tools" data-testid="annotation-toolbar">
      <span className="toolbar-attachment">Attachment: {attachmentId}</span>
      <div className="toolbar-tools">
        {TOOLS.map(({ id, label, testId, Icon }) => (
          <button
            key={id}
            type="button"
            className="toolbar-tool-button"
            data-testid={testId}
            aria-label={label}
            aria-pressed={activeTool === id}
            onClick={() => setActiveTool(id)}
          >
            <Icon />
          </button>
        ))}
      </div>
    </header>
  );
}
