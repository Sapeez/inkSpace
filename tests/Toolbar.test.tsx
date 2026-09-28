import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupJsdom } from './setup/jsdom';
import { TEST_IDS } from './consts/inkSpace';

setupJsdom();

const { cleanup, render, screen } = await import('@testing-library/react');
const { default: Toolbar } = await import('../src/toolbar/Toolbar.jsx');
const { DEFAULT_ANNOTATION_STYLE } = await import('../src/toolbar/StyleControls');

afterEach(() => {
  cleanup();
});

function renderToolbar(role: string | undefined) {
  return render(
    <Toolbar
      attachmentId="attachment-1"
      role={role}
      activeTool="pen"
      onToolChange={() => {}}
      style={DEFAULT_ANNOTATION_STYLE}
      onStyleChange={() => {}}
      onSignaturePlace={() => false}
      onDownload={() => {}}
      downloading={false}
      downloadError={null}
      onSaveClick={() => {}}
      onShareClick={() => {}}
    />,
  );
}

test('P3: an edit-only session sees the full annotation toolbar and Save, but no Share button', () => {
  renderToolbar('edit');

  assert.ok(screen.getByTestId(TEST_IDS.ANNOTATION_TOOLBAR));
  assert.ok(screen.getByTestId(TEST_IDS.SAVE_BUTTON));
  assert.equal(screen.queryByTestId(TEST_IDS.SHARE_BUTTON), null);
  assert.equal(screen.queryByTestId(TEST_IDS.NOTES_BUTTON), null);
});

test('P1: the owner sees the full toolbar, Save, and Share', () => {
  renderToolbar('owner');

  assert.ok(screen.getByTestId(TEST_IDS.ANNOTATION_TOOLBAR));
  assert.ok(screen.getByTestId(TEST_IDS.SAVE_BUTTON));
  assert.ok(screen.getByTestId(TEST_IDS.SHARE_BUTTON));
});

test('P3/P4: a view-only session has no annotation toolbar or Save button in the DOM, and sees Notes instead', () => {
  renderToolbar('view');

  assert.equal(screen.queryByTestId(TEST_IDS.ANNOTATION_TOOLBAR), null);
  assert.equal(screen.queryByTestId(TEST_IDS.SAVE_BUTTON), null);
  assert.equal(screen.queryByTestId(TEST_IDS.SHARE_BUTTON), null);
  assert.ok(screen.getByTestId(TEST_IDS.NOTES_BUTTON));
});

test('Download stays available regardless of role', () => {
  renderToolbar('view');
  assert.ok(screen.getByTestId(TEST_IDS.DOWNLOAD_BUTTON));
});

test('defaults to the full toolbar when no role is passed (back-compat)', () => {
  renderToolbar(undefined);
  assert.ok(screen.getByTestId(TEST_IDS.ANNOTATION_TOOLBAR));
  assert.ok(screen.getByTestId(TEST_IDS.SAVE_BUTTON));
});
