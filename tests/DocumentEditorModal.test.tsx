import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { setupJsdom } from './setup/jsdom';

setupJsdom();

const { cleanup, fireEvent, render, screen, waitFor, within } = await import('@testing-library/react');
const { default: DocumentEditorModal } = await import('../src/modals/DocumentEditorModal');

afterEach(() => {
  cleanup();
});

function fakeDoc(numPages: number): PDFDocumentProxy {
  const page = {
    rotate: 0,
    getViewport: ({ scale = 1 }: { scale?: number } = {}) => ({ width: 600 * scale, height: 800 * scale }),
    render: () => ({ promise: Promise.resolve(), cancel: () => {} }),
  };
  return { numPages, getPage: async () => page } as unknown as PDFDocumentProxy;
}

function pdfFile(name: string, body = '%PDF-1.4 fake'): File {
  const file = new File([body], name, { type: 'application/pdf' });
  // jsdom's Blob may predate arrayBuffer(); make sure the modal can read it.
  if (typeof file.arrayBuffer !== 'function') {
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new TextEncoder().encode(body).buffer });
  }
  return file;
}

function setup(overrides: Partial<{ numPages: number; initialPage: number; onSave: () => Promise<void>; loadPdf: (data: Uint8Array) => Promise<PDFDocumentProxy> }> = {}) {
  const onClose = mock.fn();
  const onSave = mock.fn(overrides.onSave ?? (async () => {}));
  const loadPdf = mock.fn(overrides.loadPdf ?? (async () => fakeDoc(2)));
  render(
    <DocumentEditorModal
      open
      onClose={onClose}
      pdfDoc={fakeDoc(overrides.numPages ?? 4)}
      initialPage={overrides.initialPage ?? 1}
      onSave={onSave as never}
      loadPdf={loadPdf as never}
    />,
  );
  return { onClose, onSave, loadPdf };
}

const pageItems = () => screen.getAllByTestId('document-editor-page');
const keys = () => pageItems().map((item) => item.getAttribute('data-page-key'));
const currentKey = () => pageItems().find((item) => item.classList.contains('document-editor-page--current'))?.getAttribute('data-page-key');

function dataTransfer() {
  const store = new Map<string, string>();
  return { setData: (type: string, value: string) => store.set(type, value), getData: (type: string) => store.get(type) ?? '', effectAllowed: '', dropEffect: '' };
}

test('renders nothing while closed; opens with every page, focused on the page the user was viewing', () => {
  const { container } = render(<DocumentEditorModal open={false} onClose={() => {}} pdfDoc={fakeDoc(3)} initialPage={1} onSave={async () => {}} />);
  assert.equal(container.textContent, '');
  cleanup();

  setup({ numPages: 4, initialPage: 3 });
  assert.equal(pageItems().length, 4);
  assert.equal(currentKey(), '0-2', 'the page shown in the annotation view has the highlighted border');
  assert.equal(pageItems()[2]!.getAttribute('aria-current'), 'page');
});

test('clicking a page moves the focus (highlighted border) to it', () => {
  setup({ numPages: 3 });
  fireEvent.click(pageItems()[1]!);
  assert.equal(currentKey(), '0-1');
});

test('uploading a PDF inserts its pages right after the focused page and focuses the first of them', async () => {
  const { loadPdf } = setup({ numPages: 3, initialPage: 2 });
  fireEvent.change(screen.getByTestId('document-editor-upload-input'), { target: { files: [pdfFile('extra.pdf')] } });

  await waitFor(() => assert.equal(pageItems().length, 5));
  assert.deepEqual(keys(), ['0-0', '0-1', '1-0', '1-1', '0-2']);
  assert.equal(currentKey(), '1-0');
  assert.equal(loadPdf.mock.callCount(), 1);
});

test('uploading several PDFs inserts them in the order chosen', async () => {
  setup({ numPages: 2, initialPage: 1 });
  fireEvent.change(screen.getByTestId('document-editor-upload-input'), { target: { files: [pdfFile('a.pdf'), pdfFile('b.pdf')] } });
  await waitFor(() => assert.equal(pageItems().length, 6));
  assert.deepEqual(keys(), ['0-0', '1-0', '1-1', '2-0', '2-1', '0-1']);
});

test('only PDFs are accepted: a non-PDF is refused with a message and adds nothing', async () => {
  const { loadPdf } = setup({ numPages: 2 });
  const notPdf = new File(['hello'], 'notes.txt', { type: 'text/plain' });
  fireEvent.change(screen.getByTestId('document-editor-upload-input'), { target: { files: [notPdf] } });

  assert.match((await screen.findByTestId('document-editor-upload-error')).textContent ?? '', /only PDF files can be added/);
  assert.equal(pageItems().length, 2);
  assert.equal(loadPdf.mock.callCount(), 0);
});

test('a file named .pdf that is not really a PDF, or cannot be parsed, is refused', async () => {
  setup({ numPages: 2, loadPdf: async () => { throw new Error('bad pdf'); } });
  fireEvent.change(screen.getByTestId('document-editor-upload-input'), {
    target: { files: [pdfFile('fake.pdf', 'this is not a pdf'), pdfFile('broken.pdf')] },
  });
  const message = (await screen.findByTestId('document-editor-upload-error')).textContent ?? '';
  assert.match(message, /fake\.pdf: only PDF files can be added/);
  assert.match(message, /broken\.pdf: couldn't be read/);
  assert.equal(pageItems().length, 2);
});

test('dragging a page onto another repositions exactly that one page', () => {
  setup({ numPages: 4 });
  const transfer = dataTransfer();
  const items = pageItems();
  fireEvent.dragStart(items[0]!, { dataTransfer: transfer });
  fireEvent.dragOver(items[2]!, { dataTransfer: transfer });
  fireEvent.drop(items[2]!, { dataTransfer: transfer });

  assert.deepEqual(keys(), ['0-1', '0-2', '0-0', '0-3']);
  assert.equal(currentKey(), '0-0', 'the moved page stays focused');
});

test('rotating the focused page enables Save; dropping back to the original order alone does not', () => {
  setup({ numPages: 2 });
  const save = screen.getByTestId('document-editor-save') as HTMLButtonElement;
  assert.equal(save.disabled, true, 'nothing changed yet');

  fireEvent.click(screen.getByTestId('document-editor-rotate-right'));
  assert.equal(save.disabled, false);
  fireEvent.click(screen.getByTestId('document-editor-rotate-left'));
  assert.equal(save.disabled, true, 'rotated back to 0°');
});

test('Delete page asks "Delete page?" first; confirming removes the focused page, cancelling keeps it', () => {
  setup({ numPages: 3, initialPage: 2 });

  fireEvent.click(screen.getByTestId('document-editor-delete'));
  assert.equal(screen.getByTestId('document-editor-delete-title').textContent, 'Delete page?');
  fireEvent.click(screen.getByTestId('document-editor-delete-cancel'));
  assert.equal(pageItems().length, 3);
  assert.equal(screen.queryByTestId('document-editor-delete-modal'), null);

  fireEvent.click(screen.getByTestId('document-editor-delete'));
  fireEvent.click(screen.getByTestId('document-editor-delete-confirm'));
  assert.deepEqual(keys(), ['0-0', '0-2']);
  assert.equal(currentKey(), '0-2', 'focus moves to the page that took its place');
});

test('the last remaining page cannot be deleted', () => {
  setup({ numPages: 1 });
  assert.equal((screen.getByTestId('document-editor-delete') as HTMLButtonElement).disabled, true);
});

test('Cancel closes immediately, even with unsaved changes — no confirmation', () => {
  const { onClose, onSave } = setup({ numPages: 3 });
  fireEvent.click(screen.getByTestId('document-editor-rotate-right'));
  fireEvent.click(screen.getByTestId('document-editor-cancel'));

  assert.equal(onClose.mock.callCount(), 1);
  assert.equal(onSave.mock.callCount(), 0);
  assert.equal(screen.queryByRole('alertdialog'), null);
});

test('Save and Cancel sit together in the footer, Cancel first, Save last (right-aligned)', () => {
  setup({ numPages: 2 });
  const buttons = within(document.querySelector('.document-editor-footer') as HTMLElement).getAllByRole('button');
  assert.deepEqual(buttons.map((button) => button.textContent), ['Cancel', 'Save']);
});

test('Save hands the final page list and the uploaded bytes to onSave, then closes', async () => {
  const { onSave, onClose } = setup({ numPages: 2, initialPage: 1 });
  fireEvent.change(screen.getByTestId('document-editor-upload-input'), { target: { files: [pdfFile('extra.pdf')] } });
  await waitFor(() => assert.equal(pageItems().length, 4));
  fireEvent.click(screen.getByTestId('document-editor-rotate-right'));
  fireEvent.click(screen.getByTestId('document-editor-save'));

  await waitFor(() => assert.equal(onClose.mock.callCount(), 1));
  const result = (onSave.mock.calls[0] as unknown as { arguments: unknown[] }).arguments[0] as { pages: Array<{ key: string; rotation: number }>; uploads: Uint8Array[] };
  assert.deepEqual(result.pages.map((page) => page.key), ['0-0', '1-0', '1-1', '0-1']);
  assert.equal(result.pages[1]!.rotation, 90, 'the rotated page is the focused (first inserted) one');
  assert.equal(result.uploads.length, 1);
});

test('a failed Save keeps the editor open with the error and re-enables the buttons', async () => {
  const { onClose } = setup({ numPages: 2, onSave: async () => { throw new Error('Disk full'); } });
  fireEvent.click(screen.getByTestId('document-editor-rotate-right'));
  fireEvent.click(screen.getByTestId('document-editor-save'));

  assert.equal((await screen.findByTestId('document-editor-save-error')).textContent, 'Disk full');
  assert.equal(onClose.mock.callCount(), 0);
  assert.equal((screen.getByTestId('document-editor-save') as HTMLButtonElement).disabled, false);
});
