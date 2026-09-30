import type { ChangeEvent } from 'react';
import ColorPicker from './ColorPicker';

// Each tool keeps its own style (ViewerPage.jsx holds a per-tool map), so
// switching tools never overrides another tool's color/width. Re-selecting an
// existing annotation and changing a control restyles that object live; see
// AnnotationCanvas.jsx's `applyStyleToObject` and its `useEffect` keyed on
// `style`.
export interface AnnotationStyle {
  color: string;
  strokeWidth: number;
  // Closed shapes only (rectangle, ellipse, cloud, polygon); null/absent = no fill.
  fill?: string | null;
  // Text tool only. Limited to the PDF standard families so the burned-in
  // text (server/services/burn-in.ts) matches what's shown on the canvas.
  fontFamily?: string;
  // Text tool only, in PDF points; absent = DEFAULT_FONT_SIZE.
  fontSize?: number;
}

export const FONT_OPTIONS = ['Helvetica', 'Times New Roman', 'Courier New'] as const;
export const DEFAULT_FONT_FAMILY = FONT_OPTIONS[0];
export const DEFAULT_FONT_SIZE = 16;

export const DEFAULT_ANNOTATION_STYLE: AnnotationStyle = {
  color: '#dc2626',
  strokeWidth: 4,
};

interface StyleControlsProps {
  style: AnnotationStyle;
  onStyleChange: (style: AnnotationStyle) => void;
  showStrokeWidth?: boolean;
  showFill?: boolean;
  showFont?: boolean;
}

export default function StyleControls({ style, onStyleChange, showStrokeWidth = true, showFill = false, showFont = false }: StyleControlsProps) {
  function handleStrokeWidthChange(event: ChangeEvent<HTMLInputElement>) {
    const value = Number(event.target.value);
    if (!Number.isFinite(value) || value <= 0) return;
    onStyleChange({ ...style, strokeWidth: value });
  }

  function handleFontSizeChange(event: ChangeEvent<HTMLInputElement>) {
    const value = Number(event.target.value);
    if (!Number.isFinite(value) || value <= 0) return;
    onStyleChange({ ...style, fontSize: value });
  }

  return (
    <div className="style-controls" data-testid="style-controls">
      <label className="style-controls-field">
        <span className="style-controls-label">Color</span>
        <ColorPicker color={style.color} onChange={(color) => onStyleChange({ ...style, color })} />
      </label>
      {showFont && (
        <label className="style-controls-field">
          <span className="style-controls-label">Font</span>
          <select
            value={style.fontFamily ?? DEFAULT_FONT_FAMILY}
            onChange={(event) => onStyleChange({ ...style, fontFamily: event.target.value })}
            data-testid="style-font-picker"
            aria-label="Font"
            className="style-controls-font-select"
            style={{ fontFamily: style.fontFamily ?? DEFAULT_FONT_FAMILY }}
          >
            {FONT_OPTIONS.map((font) => (
              <option key={font} value={font} style={{ fontFamily: font }}>
                {font}
              </option>
            ))}
          </select>
        </label>
      )}
      {showFont && (
        <label className="style-controls-field">
          <span className="style-controls-label">Size</span>
          <input
            type="number"
            min={1}
            value={style.fontSize ?? DEFAULT_FONT_SIZE}
            onChange={handleFontSizeChange}
            data-testid="style-font-size-picker"
            aria-label="Font size"
            className="style-controls-width-input"
          />
        </label>
      )}
      {showStrokeWidth && (
        <label className="style-controls-field">
          <span className="style-controls-label">Stroke width</span>
          <input
            type="number"
            min={1}
            value={style.strokeWidth}
            onChange={handleStrokeWidthChange}
            data-testid="style-width-picker"
            aria-label="Stroke width"
            className="style-controls-width-input"
          />
        </label>
      )}
      {showFill && (
        <div className="style-controls-field">
          <label className="style-controls-label style-controls-fill-toggle">
            <input
              type="checkbox"
              checked={Boolean(style.fill)}
              onChange={(event) => onStyleChange({ ...style, fill: event.target.checked ? style.color : null })}
              data-testid="style-fill-toggle"
            />
            Fill
          </label>
          {style.fill && <ColorPicker color={style.fill} onChange={(fill) => onStyleChange({ ...style, fill })} />}
        </div>
      )}
    </div>
  );
}
