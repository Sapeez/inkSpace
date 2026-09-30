import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react';

// Custom picker instead of `<input type="color">`: the browser's native
// picker popup (and its RGB/HSL/Hex fields) can't be styled, so it can't be
// rounded or resized. Emits the same lowercase `#rrggbb` string the canvas
// expects (see AnnotationCanvas.jsx's `withAlpha`).
interface Hsv {
  h: number;
  s: number;
  v: number;
}

const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => Math.round(clamp(c, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
}

function rgbToHsv(r: number, g: number, b: number, hueFallback: number): Hsv {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const delta = max - Math.min(rn, gn, bn);
  let h = hueFallback;
  if (delta > 0) {
    if (max === rn) h = 60 * (((gn - bn) / delta + 6) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
    else h = 60 * ((rn - gn) / delta + 4);
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

function hsvToRgb({ h, s, v }: Hsv): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255;
  };
  return [f(5), f(3), f(1)];
}

function hsvToHex(hsv: Hsv): string {
  return rgbToHex(...hsvToRgb(hsv));
}

function hsvToHsl({ h, s, v }: Hsv): [number, number, number] {
  const l = v * (1 - s / 2);
  const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
  return [h, sl, l];
}

function hslToHsv(h: number, s: number, l: number): Hsv {
  const v = l + s * Math.min(l, 1 - l);
  return { h, s: v === 0 ? 0 : 2 * (1 - l / v), v };
}

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
}

export default function ColorPicker({ color, onChange }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [hsv, setHsv] = useState<Hsv>(() => rgbToHsv(...hexToRgb(color), 0));
  const [hexDraft, setHexDraft] = useState(color);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hsvToHex(hsv) !== color.toLowerCase()) setHsv(rgbToHsv(...hexToRgb(color), hsv.h));
    setHexDraft(color);
    // Only an outside change to `color` should resync the internal HSV.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color]);

  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function commit(next: Hsv) {
    setHsv(next);
    const hex = hsvToHex(next);
    setHexDraft(hex);
    onChange(hex);
  }

  function pickFromArea(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    commit({
      h: hsv.h,
      s: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      v: 1 - clamp((event.clientY - rect.top) / rect.height, 0, 1),
    });
  }

  function handleHexChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value.startsWith('#') ? event.target.value : `#${event.target.value}`;
    setHexDraft(value);
    if (HEX_PATTERN.test(value)) commit(rgbToHsv(...hexToRgb(value), hsv.h));
  }

  const [r, g, b] = hsvToRgb(hsv).map(Math.round) as [number, number, number];
  const [hue, sat, light] = hsvToHsl(hsv);

  function numberField(label: string, value: number, max: number, onValue: (value: number) => void, testId: string) {
    return (
      <label className="color-picker-field">
        <input
          type="number"
          min={0}
          max={max}
          value={value}
          aria-label={label}
          data-testid={testId}
          className="color-picker-input"
          onChange={(event) => {
            const parsed = Number(event.target.value);
            if (event.target.value === '' || !Number.isFinite(parsed)) return;
            onValue(clamp(parsed, 0, max));
          }}
        />
        <span className="color-picker-field-label">{label}</span>
      </label>
    );
  }

  return (
    <div className="color-picker" ref={rootRef}>
      <button
        type="button"
        className="color-picker-swatch"
        style={{ backgroundColor: color }}
        aria-label="Annotation color"
        aria-expanded={open}
        data-testid="style-color-picker"
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      />
      {open && (
        <div className="color-picker-panel" role="dialog" aria-label="Color picker" data-testid="color-picker-panel">
          <div
            className="color-picker-area"
            style={{ backgroundColor: hsvToHex({ h: hsv.h, s: 1, v: 1 }) }}
            data-testid="color-picker-area"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture?.(event.pointerId);
              pickFromArea(event);
            }}
            onPointerMove={(event) => {
              if (event.buttons === 1) pickFromArea(event);
            }}
          >
            <div className="color-picker-area-white" />
            <div className="color-picker-area-black" />
            <span
              className="color-picker-area-handle"
              style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={360}
            value={Math.round(hsv.h)}
            aria-label="Hue"
            className="color-picker-hue"
            data-testid="color-picker-hue"
            onChange={(event) => commit({ ...hsv, h: Number(event.target.value) })}
          />
          <div className="color-picker-fields">
            <label className="color-picker-field color-picker-field--hex">
              <input
                type="text"
                value={hexDraft}
                maxLength={7}
                aria-label="Hex"
                data-testid="style-color-hex"
                className="color-picker-input"
                onChange={handleHexChange}
              />
              <span className="color-picker-field-label">Hex</span>
            </label>
            <div className="color-picker-row">
              {numberField('R', r, 255, (v) => commit(rgbToHsv(v, g, b, hsv.h)), 'color-picker-r')}
              {numberField('G', g, 255, (v) => commit(rgbToHsv(r, v, b, hsv.h)), 'color-picker-g')}
              {numberField('B', b, 255, (v) => commit(rgbToHsv(r, g, v, hsv.h)), 'color-picker-b')}
            </div>
            <div className="color-picker-row">
              {numberField('H', Math.round(hue), 360, (v) => commit(hslToHsv(v, sat, light)), 'color-picker-h')}
              {numberField('S', Math.round(sat * 100), 100, (v) => commit(hslToHsv(hue, v / 100, light)), 'color-picker-s')}
              {numberField('L', Math.round(light * 100), 100, (v) => commit(hslToHsv(hue, sat, v / 100)), 'color-picker-l')}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
