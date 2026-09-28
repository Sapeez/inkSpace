import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupJsdom } from './setup/jsdom';
import { TEST_IDS, TEXT_CONTENT } from './consts/inkSpace';
import { MAX_UPLOAD_BYTES } from '../src/utils/uploadLimits.js';

setupJsdom();

const { cleanup, fireEvent, render, screen, waitFor } = await import('@testing-library/react');
const { default: SaveModal } = await import('../src/modals/SaveModal');

const originalFetch = globalThis.fetch;

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

test('S2/F1-F2: pre-fills the filename field with the original name plus a UTC timestamp', () => {
  render(
    <SaveModal
      open
      attachmentId="attachment-1"
      originalFilename="report.pdf"
      onClose={() => {}}
      getAnnotations={() => []}
    />,
  );

  const input = screen.getByTestId(TEST_IDS.SAVE_MODAL_FILENAME_INPUT) as HTMLInputElement;
  assert.match(input.value, /^report \d{12}\.pdf$/);
});

test('F3: replaces an existing trailing timestamp instead of appending a second one', () => {
  render(
    <SaveModal
      open
      attachmentId="attachment-1"
      originalFilename="report 240820250715.pdf"
      onClose={() => {}}
      getAnnotations={() => []}
    />,
  );

  const input = screen.getByTestId(TEST_IDS.SAVE_MODAL_FILENAME_INPUT) as HTMLInputElement;
  assert.match(input.value, /^report \d{12}\.pdf$/);
  assert.equal(input.value.match(/\d{12}/g)?.length, 1);
});

test('F4: typing an empty filename shows the required-field error and disables Save', () => {
  render(
    <SaveModal
      open
      attachmentId="attachment-1"
      originalFilename="report.pdf"
      onClose={() => {}}
      getAnnotations={() => []}
    />,
  );

  const input = screen.getByTestId(TEST_IDS.SAVE_MODAL_FILENAME_INPUT);
  fireEvent.change(input, { target: { value: '' } });

  assert.equal(screen.getByTestId(TEST_IDS.FILENAME_VALIDATION_ERROR).textContent, TEXT_CONTENT.VALIDATION_REQUIRED);
  assert.equal((screen.getByTestId(TEST_IDS.SAVE_MODAL_CONFIRM_BUTTON) as HTMLButtonElement).disabled, true);
});

test('F5: typing a 256-character filename shows the max-length error', () => {
  render(
    <SaveModal
      open
      attachmentId="attachment-1"
      originalFilename="report.pdf"
      onClose={() => {}}
      getAnnotations={() => []}
    />,
  );

  const input = screen.getByTestId(TEST_IDS.SAVE_MODAL_FILENAME_INPUT);
  fireEvent.change(input, { target: { value: `${'a'.repeat(252)}.pdf` } });

  assert.equal(screen.getByTestId(TEST_IDS.FILENAME_VALIDATION_ERROR).textContent, TEXT_CONTENT.VALIDATION_MAX_LENGTH);
});

test('F6: typing a filename with a path separator shows the invalid-characters error', () => {
  render(
    <SaveModal
      open
      attachmentId="attachment-1"
      originalFilename="report.pdf"
      onClose={() => {}}
      getAnnotations={() => []}
    />,
  );

  const input = screen.getByTestId(TEST_IDS.SAVE_MODAL_FILENAME_INPUT);
  fireEvent.change(input, { target: { value: 'report/draft.pdf' } });

  assert.equal(screen.getByTestId(TEST_IDS.FILENAME_VALIDATION_ERROR).textContent, TEXT_CONTENT.VALIDATION_INVALID_CHARS);
});

test('S4/S5: shows a progress indicator and visibly disables the filename field, Cancel, and Close while saving', async () => {
  const burnInGate = deferred<Response>();
  globalThis.fetch = (async (url: string) => {
    if (url.includes('/api/burn-in/')) return burnInGate.promise;
    return jsonResponse({ id: 'new-id' });
  }) as typeof fetch;

  render(
    <SaveModal
      open
      attachmentId="attachment-1"
      originalFilename="report.pdf"
      onClose={() => {}}
      getAnnotations={() => []}
    />,
  );

  fireEvent.click(screen.getByTestId(TEST_IDS.SAVE_MODAL_CONFIRM_BUTTON));

  await waitFor(() => {
    assert.ok(screen.getByTestId(TEST_IDS.SAVE_PROGRESS_INDICATOR));
  });
  assert.equal((screen.getByTestId(TEST_IDS.SAVE_MODAL_FILENAME_INPUT) as HTMLInputElement).disabled, true);
  assert.equal((screen.getByTestId(TEST_IDS.SAVE_MODAL_CANCEL_BUTTON) as HTMLButtonElement).disabled, true);
  assert.equal((screen.getByTestId(TEST_IDS.SAVE_MODAL_CLOSE_BUTTON) as HTMLButtonElement).disabled, true);

  burnInGate.resolve(jsonResponse({ filename: 'report.pdf', mimeType: 'application/pdf', pdfBase64: 'AA==' }));
  await waitFor(() => {
    assert.ok(screen.getByTestId(TEST_IDS.SUCCESS_TOAST));
  });
});

test('S7: a successful save shows the exact success toast and leaves the modal open (S8)', async () => {
  globalThis.fetch = (async (url: string) => {
    if (url.includes('/api/burn-in/')) {
      return jsonResponse({ filename: 'report.pdf', mimeType: 'application/pdf', pdfBase64: 'AA==' });
    }
    return jsonResponse({ id: 'new-id' });
  }) as typeof fetch;

  render(
    <SaveModal
      open
      attachmentId="attachment-1"
      originalFilename="report.pdf"
      onClose={() => {}}
      getAnnotations={() => []}
    />,
  );

  const input = screen.getByTestId(TEST_IDS.SAVE_MODAL_FILENAME_INPUT) as HTMLInputElement;
  fireEvent.change(input, { target: { value: 'my-report.pdf' } });
  fireEvent.click(screen.getByTestId(TEST_IDS.SAVE_MODAL_CONFIRM_BUTTON));

  await waitFor(() => {
    assert.equal(
      screen.getByTestId(TEST_IDS.SUCCESS_TOAST).textContent,
      'my-report.pdf saved successfully to workspace.',
    );
  });
  assert.ok(screen.getByTestId(TEST_IDS.SAVE_MODAL));
});

test('S6: a failed save shows the exact failure toast and leaves the modal open (S8)', async () => {
  globalThis.fetch = (async (url: string) => {
    if (url.includes('/api/burn-in/')) {
      return jsonResponse({ message: 'burn-in failed' }, false);
    }
    return jsonResponse({ id: 'new-id' });
  }) as typeof fetch;

  render(
    <SaveModal
      open
      attachmentId="attachment-1"
      originalFilename="report.pdf"
      onClose={() => {}}
      getAnnotations={() => []}
    />,
  );

  const input = screen.getByTestId(TEST_IDS.SAVE_MODAL_FILENAME_INPUT) as HTMLInputElement;
  fireEvent.change(input, { target: { value: 'my-report.pdf' } });
  fireEvent.click(screen.getByTestId(TEST_IDS.SAVE_MODAL_CONFIRM_BUTTON));

  await waitFor(() => {
    assert.equal(screen.getByTestId(TEST_IDS.ERROR_TOAST).textContent, "Couldn't save my-report.pdf.");
  });
  assert.ok(screen.getByTestId(TEST_IDS.SAVE_MODAL));
  assert.equal((screen.getByTestId(TEST_IDS.SAVE_MODAL_FILENAME_INPUT) as HTMLInputElement).disabled, false);
});

test('5.3: an oversized burned PDF is rejected client-side before Save is ever called, with the exact S6 toast plus a size-specific message', async () => {
  const oversizedBase64 = Buffer.alloc(MAX_UPLOAD_BYTES + 1024).toString('base64');
  let createAttachmentCalled = false;
  globalThis.fetch = (async (url: string) => {
    if (url.includes('/api/burn-in/')) {
      return jsonResponse({ filename: 'report.pdf', mimeType: 'application/pdf', pdfBase64: oversizedBase64 });
    }
    createAttachmentCalled = true;
    return jsonResponse({ id: 'new-id' });
  }) as typeof fetch;

  render(
    <SaveModal
      open
      attachmentId="attachment-1"
      originalFilename="report.pdf"
      onClose={() => {}}
      getAnnotations={() => []}
    />,
  );

  const input = screen.getByTestId(TEST_IDS.SAVE_MODAL_FILENAME_INPUT) as HTMLInputElement;
  fireEvent.change(input, { target: { value: 'my-report.pdf' } });
  fireEvent.click(screen.getByTestId(TEST_IDS.SAVE_MODAL_CONFIRM_BUTTON));

  await waitFor(() => {
    assert.equal(screen.getByTestId(TEST_IDS.ERROR_TOAST).textContent, "Couldn't save my-report.pdf.");
  });
  assert.match(screen.getByTestId(TEST_IDS.SAVE_MODAL_SIZE_ERROR).textContent!, /14MB limit/);
  assert.equal(createAttachmentCalled, false, 'the save endpoint must never be called for an oversized result');
});

test('Cancel closes the modal when not saving', () => {
  let closed = false;
  render(
    <SaveModal
      open
      attachmentId="attachment-1"
      originalFilename="report.pdf"
      onClose={() => {
        closed = true;
      }}
      getAnnotations={() => []}
    />,
  );

  fireEvent.click(screen.getByTestId(TEST_IDS.SAVE_MODAL_CANCEL_BUTTON));
  assert.equal(closed, true);
});

test('renders nothing when closed', () => {
  render(
    <SaveModal
      open={false}
      attachmentId="attachment-1"
      originalFilename="report.pdf"
      onClose={() => {}}
      getAnnotations={() => []}
    />,
  );

  assert.equal(screen.queryByTestId(TEST_IDS.SAVE_MODAL), null);
});
