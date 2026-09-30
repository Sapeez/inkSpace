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

test('renders the color and stroke-width controls at the given style values', () => {
  render(<StyleControls style={DEFAULT_ANNOTATION_STYLE} onStyleChange={() => {}} />);

  fireEvent.click(screen.getByTestId(TEST_IDS.STYLE_COLOR_PICKER));
  const hexField = screen.getByTestId(TEST_IDS.STYLE_COLOR_HEX) as HTMLInputElement;
  const widthPicker = screen.getByTestId(TEST_IDS.STYLE_WIDTH_PICKER) as HTMLInputElement;

  assert.equal(hexField.value, '#dc2626');
  assert.equal(screen.queryByTestId(TEST_IDS.STYLE_FILL_PICKER), null, 'there is no fill option');
  assert.equal(widthPicker.value, '4');
});

test('changing the color picker calls onStyleChange with only the color replaced', () => {
  let received: unknown = null;
  render(<StyleControls style={DEFAULT_ANNOTATION_STYLE} onStyleChange={(style) => (received = style)} />);

  fireEvent.click(screen.getByTestId(TEST_IDS.STYLE_COLOR_PICKER));
  fireEvent.change(screen.getByTestId(TEST_IDS.STYLE_COLOR_HEX), { target: { value: '#2563eb' } });

  assert.deepEqual(received, { ...DEFAULT_ANNOTATION_STYLE, color: '#2563eb' });
});

test('showStrokeWidth={false} hides the stroke-width input', () => {
  render(<StyleControls style={DEFAULT_ANNOTATION_STYLE} onStyleChange={() => {}} showStrokeWidth={false} />);

  assert.equal(screen.queryByTestId(TEST_IDS.STYLE_WIDTH_PICKER), null);
  assert.ok(screen.getByTestId(TEST_IDS.STYLE_COLOR_PICKER));
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

test('the color panel opens on click and closes on Escape', () => {
  render(<StyleControls style={DEFAULT_ANNOTATION_STYLE} onStyleChange={() => {}} />);

  assert.equal(screen.queryByTestId('color-picker-panel'), null);
  fireEvent.click(screen.getByTestId(TEST_IDS.STYLE_COLOR_PICKER));
  assert.ok(screen.getByTestId('color-picker-panel'));
  fireEvent.keyDown(document, { key: 'Escape' });
  assert.equal(screen.queryByTestId('color-picker-panel'), null);
});

test('the RGB and HSL fields edit the color, and an invalid hex is ignored', () => {
  const received: unknown[] = [];
  render(<StyleControls style={DEFAULT_ANNOTATION_STYLE} onStyleChange={(style) => received.push(style)} />);

  fireEvent.click(screen.getByTestId(TEST_IDS.STYLE_COLOR_PICKER));
  fireEvent.change(screen.getByTestId('color-picker-r'), { target: { value: '0' } });
  assert.deepEqual(received.at(-1), { ...DEFAULT_ANNOTATION_STYLE, color: '#002626' });

  const before = received.length;
  fireEvent.change(screen.getByTestId(TEST_IDS.STYLE_COLOR_HEX), { target: { value: '#zzz' } });
  assert.equal(received.length, before);

  fireEvent.change(screen.getByTestId('color-picker-l'), { target: { value: '100' } });
  assert.deepEqual(received.at(-1), { ...DEFAULT_ANNOTATION_STYLE, color: '#ffffff' });
});

test('the font picker only renders when showFont is set, and changing it replaces only fontFamily', () => {
  const { unmount } = render(<StyleControls style={DEFAULT_ANNOTATION_STYLE} onStyleChange={() => {}} />);
  assert.equal(screen.queryByTestId('style-font-picker'), null);
  unmount();

  let received: unknown = null;
  render(<StyleControls style={DEFAULT_ANNOTATION_STYLE} onStyleChange={(style) => (received = style)} showFont />);
  fireEvent.change(screen.getByTestId('style-font-picker'), { target: { value: 'Courier New' } });

  assert.deepEqual(received, { ...DEFAULT_ANNOTATION_STYLE, fontFamily: 'Courier New' });
});

test('the font size input only renders with showFont, and changing it replaces only fontSize (ignoring non-positive values)', () => {
  let received: unknown = null;
  render(<StyleControls style={DEFAULT_ANNOTATION_STYLE} onStyleChange={(style) => (received = style)} showFont />);
  const input = screen.getByTestId('style-font-size-picker');
  assert.equal((input as HTMLInputElement).value, '16');

  fireEvent.change(input, { target: { value: '0' } });
  assert.equal(received, null);

  fireEvent.change(input, { target: { value: '28' } });
  assert.deepEqual(received, { ...DEFAULT_ANNOTATION_STYLE, fontSize: 28 });
});
