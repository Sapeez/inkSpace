import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupJsdom } from './setup/jsdom';
import { TEST_IDS } from './consts/inkSpace';

setupJsdom();

const { cleanup, fireEvent, render, screen } = await import('@testing-library/react');
const {
  default: SignatureUploader,
  validateSignatureFile,
  MAX_SIGNATURE_IMAGE_BYTES,
  ALLOWED_SIGNATURE_IMAGE_TYPES,
} = await import('../src/annotation-canvas/SignatureUploader');

afterEach(() => {
  cleanup();
});

// A real `FileReader`/`Image` load never resolves in this jsdom setup (no
// real image decode without the `canvas` npm package, which isn't
// installed) — see AnnotationCanvas.jsx's `addSignatureImage` comment and
// SignatureUploader.tsx's own comments for why the re-encode step lives
// there. These tests exercise everything up to that boundary: type/size
// validation (A8/R8) and the button/error wiring, all of which resolve
// before a real image would ever need to load.
function makeFile(name: string, type: string, size: number) {
  const file = new File([new Uint8Array(Math.min(size, 1024))], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

test('validateSignatureFile accepts every allowed image type under the size limit', () => {
  for (const type of ALLOWED_SIGNATURE_IMAGE_TYPES) {
    const file = makeFile('sig', type, 1024);
    assert.equal(validateSignatureFile(file), null);
  }
});

test('validateSignatureFile rejects a non-image type', () => {
  const file = makeFile('resume.pdf', 'application/pdf', 1024);
  assert.match(validateSignatureFile(file)!, /PNG|JPEG|GIF|WebP/);
});

test('validateSignatureFile rejects a file over the size limit', () => {
  const file = makeFile('huge.png', 'image/png', MAX_SIGNATURE_IMAGE_BYTES + 1);
  assert.match(validateSignatureFile(file)!, /smaller/);
});

test('validateSignatureFile accepts a file exactly at the size limit', () => {
  const file = makeFile('exact.png', 'image/png', MAX_SIGNATURE_IMAGE_BYTES);
  assert.equal(validateSignatureFile(file), null);
});

test('renders a toolbar-styled button and a hidden, image-restricted file input', () => {
  render(<SignatureUploader onPlace={() => true} />);

  const button = screen.getByTestId(TEST_IDS.TOOL_SIGNATURE);
  assert.equal(button.getAttribute('aria-label'), 'Signature');

  const input = screen.getByTestId('signature-file-input') as HTMLInputElement;
  assert.equal(input.type, 'file');
  assert.equal(input.accept, ALLOWED_SIGNATURE_IMAGE_TYPES.join(','));
});

test('clicking the button opens the file picker (delegates to the hidden input)', () => {
  render(<SignatureUploader onPlace={() => true} />);

  const input = screen.getByTestId('signature-file-input') as HTMLInputElement;
  let clicked = false;
  input.addEventListener('click', () => {
    clicked = true;
  });

  fireEvent.click(screen.getByTestId(TEST_IDS.TOOL_SIGNATURE));

  assert.equal(clicked, true);
});

test('selecting a non-image file shows an inline error and never calls onPlace', () => {
  let called = false;
  render(<SignatureUploader onPlace={() => { called = true; return true; }} />);

  const input = screen.getByTestId('signature-file-input') as HTMLInputElement;
  const file = makeFile('resume.pdf', 'application/pdf', 1024);
  fireEvent.change(input, { target: { files: [file] } });

  assert.equal(called, false);
  assert.ok(screen.getByTestId('signature-upload-error'));
});

test('selecting an oversized image shows an inline error and never calls onPlace', () => {
  let called = false;
  render(<SignatureUploader onPlace={() => { called = true; return true; }} />);

  const input = screen.getByTestId('signature-file-input') as HTMLInputElement;
  const file = makeFile('huge.png', 'image/png', MAX_SIGNATURE_IMAGE_BYTES + 1);
  fireEvent.change(input, { target: { files: [file] } });

  assert.equal(called, false);
  assert.match(screen.getByTestId('signature-upload-error').textContent!, /smaller/);
});

test('a rejected selection resets the input value so re-selecting the same file still fires change', () => {
  render(<SignatureUploader onPlace={() => true} />);

  const input = screen.getByTestId('signature-file-input') as HTMLInputElement;
  const file = makeFile('resume.pdf', 'application/pdf', 1024);
  fireEvent.change(input, { target: { files: [file] } });

  assert.equal(input.value, '');
});
