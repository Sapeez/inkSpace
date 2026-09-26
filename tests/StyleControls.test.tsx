import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupJsdom } from './setup/jsdom';
import { TEST_IDS } from './consts/inkSpace';

setupJsdom();

const { cleanup, fireEvent, render, screen } = await import('@testing-library/react');
const { default: StyleControls, DEFAULT_ANNOTATION_STYLE } = await import('../src/toolbar/StyleControls');

afterEach(() => {
  cleanup();
});

test('renders the three controls at the given style values', () => {
  render(<StyleControls style={DEFAULT_ANNOTATION_STYLE} onStyleChange={() => {}} />);

  const colorPicker = screen.getByTestId(TEST_IDS.STYLE_COLOR_PICKER) as HTMLInputElement;
  const fillPicker = screen.getByTestId(TEST_IDS.STYLE_FILL_PICKER) as HTMLInputElement;
  const widthPicker = screen.getByTestId(TEST_IDS.STYLE_WIDTH_PICKER) as HTMLInputElement;

  assert.equal(colorPicker.value, '#dc2626');
  assert.equal(fillPicker.checked, false);
  assert.equal(widthPicker.value, '4');
});

test('changing the color picker calls onStyleChange with only the color replaced', () => {
  let received: unknown = null;
  render(<StyleControls style={DEFAULT_ANNOTATION_STYLE} onStyleChange={(style) => (received = style)} />);

  fireEvent.change(screen.getByTestId(TEST_IDS.STYLE_COLOR_PICKER), { target: { value: '#2563eb' } });

  assert.deepEqual(received, { ...DEFAULT_ANNOTATION_STYLE, color: '#2563eb' });
});

test('toggling the fill checkbox calls onStyleChange with only `filled` replaced', () => {
  let received: unknown = null;
  render(<StyleControls style={DEFAULT_ANNOTATION_STYLE} onStyleChange={(style) => (received = style)} />);

  fireEvent.click(screen.getByTestId(TEST_IDS.STYLE_FILL_PICKER));

  assert.deepEqual(received, { ...DEFAULT_ANNOTATION_STYLE, filled: true });
});

test('changing the stroke-width input calls onStyleChange with only `strokeWidth` replaced', () => {
  let received: unknown = null;
  render(<StyleControls style={DEFAULT_ANNOTATION_STYLE} onStyleChange={(style) => (received = style)} />);

  fireEvent.change(screen.getByTestId(TEST_IDS.STYLE_WIDTH_PICKER), { target: { value: '10' } });

  assert.deepEqual(received, { ...DEFAULT_ANNOTATION_STYLE, strokeWidth: 10 });
});

test('a zero, negative, or non-numeric stroke-width entry is rejected — onStyleChange is not called', () => {
  let calls = 0;
  render(<StyleControls style={DEFAULT_ANNOTATION_STYLE} onStyleChange={() => (calls += 1)} />);

  const widthPicker = screen.getByTestId(TEST_IDS.STYLE_WIDTH_PICKER);
  fireEvent.change(widthPicker, { target: { value: '0' } });
  fireEvent.change(widthPicker, { target: { value: '-3' } });
  fireEvent.change(widthPicker, { target: { value: 'abc' } });

  assert.equal(calls, 0, 'an invalid stroke width must never reach onStyleChange');
});
