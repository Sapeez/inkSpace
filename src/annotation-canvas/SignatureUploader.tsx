import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { SignatureIcon } from '../toolbar/toolbarIcons';
import { MAX_SIGNATURE_IMAGE_BYTES, ALLOWED_SIGNATURE_IMAGE_TYPES } from '../utils/signatureImageLimits';

// A8/R8: this is the *instant-feedback* half of the check — client-side
// only, and not authoritative. The server re-checks size and data format on
// the way in, in `burn-in.ts`'s `drawImageShape` (tasks 5.3/5.6), against
// the exact same constants (re-exported here, not redefined, so the two
// can't drift) — so a malicious client that skips this component entirely
// still can't persist an oversized or disguised file.
export { MAX_SIGNATURE_IMAGE_BYTES, ALLOWED_SIGNATURE_IMAGE_TYPES };

export function validateSignatureFile(file: File): string | null {
  if (!ALLOWED_SIGNATURE_IMAGE_TYPES.includes(file.type)) {
    return 'Please choose a PNG, JPEG, GIF, or WebP image.';
  }
  if (file.size > MAX_SIGNATURE_IMAGE_BYTES) {
    return `Image must be ${MAX_SIGNATURE_IMAGE_BYTES / (1024 * 1024)}MB or smaller.`;
  }
  return null;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Failed to load image'));
    image.src = dataUrl;
  });
}

// Rasterizes the upload through a fresh <canvas> instead of handing Fabric
// the original file's bytes directly. Not R8's authoritative control (that's
// server-side, task 5.6) — a client-side normalization step: `drawImage`
// forces a real pixel decode, so anything appended after the image data in
// the original file never reaches the canvas or the annotation JSON. A
// canvas source also serializes cleanly via Fabric's own `getSrc()`
// (`toDataURL()`), so `AnnotationCanvas.jsx` needs no separate decode step
// when it places this.
function reencodeToCanvas(image: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext('2d')?.drawImage(image, 0, 0);
  return canvas;
}

export interface PlacedSignatureImage {
  source: HTMLCanvasElement;
  naturalWidth: number;
  naturalHeight: number;
}

interface SignatureUploaderProps {
  // Returns whether the image was actually placed (see AnnotationCanvas.jsx's
  // `addSignatureImage`) — `false` when, e.g., the document hasn't finished
  // its first render yet, so this component can surface that as a visible
  // error instead of the file picker silently closing with nothing placed.
  onPlace: (image: PlacedSignatureImage) => boolean;
}

// Unlike every other toolbar entry, this isn't a canvas-gesture tool tracked
// via `activeTool` — it's a momentary action: click opens a native file
// picker, and a valid selection places the image immediately (see
// AnnotationCanvas.jsx's `addSignatureImage`), rather than arming a
// click/drag-to-place mode on the page.
export default function SignatureUploader({ onPlace }: SignatureUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function handleButtonClick() {
    inputRef.current?.click();
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    // Reset so choosing the same file again still fires a change event.
    event.target.value = '';
    if (!file) return;

    const validationError = validateSignatureFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const image = await loadImageElement(dataUrl);
      const source = reencodeToCanvas(image);
      const placed = onPlace({ source, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight });
      setError(placed ? null : "Couldn't place the signature — wait for the page to finish loading and try again.");
    } catch {
      setError("Couldn't read that image.");
    }
  }

  return (
    <div className="signature-uploader">
      <button
        type="button"
        className="toolbar-tool-button"
        data-testid="tool-signature"
        aria-label="Signature"
        onClick={handleButtonClick}
      >
        <SignatureIcon />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_SIGNATURE_IMAGE_TYPES.join(',')}
        data-testid="signature-file-input"
        className="signature-uploader-input"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleFileChange}
      />
      {error && (
        <span className="signature-uploader-error" role="alert" data-testid="signature-upload-error">
          {error}
        </span>
      )}
    </div>
  );
}
