import type { ChangeEvent } from 'react';

// A4: one global style shared by every tool — not per-tool, not per-object
// (except that re-selecting an existing annotation and changing a control
// restyles that object live; see AnnotationCanvas.jsx's `applyStyleToObject`
// and its `useEffect` keyed on `style`). Defaults match A4's stated values.
export interface AnnotationStyle {
  color: string;
  filled: boolean;
  strokeWidth: number;
}

export const DEFAULT_ANNOTATION_STYLE: AnnotationStyle = {
  color: '#dc2626',
  filled: false,
  strokeWidth: 4,
};

interface StyleControlsProps {
  style: AnnotationStyle;
  onStyleChange: (style: AnnotationStyle) => void;
}

export default function StyleControls({ style, onStyleChange }: StyleControlsProps) {
  function handleColorChange(event: ChangeEvent<HTMLInputElement>) {
    onStyleChange({ ...style, color: event.target.value });
  }

  function handleFilledChange(event: ChangeEvent<HTMLInputElement>) {
    onStyleChange({ ...style, filled: event.target.checked });
  }

  function handleStrokeWidthChange(event: ChangeEvent<HTMLInputElement>) {
    const value = Number(event.target.value);
    if (!Number.isFinite(value) || value <= 0) return;
    onStyleChange({ ...style, strokeWidth: value });
  }

  return (
    <div className="style-controls" data-testid="style-controls">
      <label className="style-controls-field">
        <span className="style-controls-label">Color</span>
        <input
          type="color"
          value={style.color}
          onChange={handleColorChange}
          data-testid="style-color-picker"
          aria-label="Annotation color"
        />
      </label>
      <label className="style-controls-field">
        <input
          type="checkbox"
          checked={style.filled}
          onChange={handleFilledChange}
          data-testid="style-fill-picker"
          aria-label="Fill shape"
        />
        <span className="style-controls-label">Fill</span>
      </label>
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
    </div>
  );
}
