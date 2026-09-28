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

// 5.1: pins the shipped annotation toolbar to exactly A1's 11 tools (the 10
// gesture tools in their required order, plus Signature) — a regression here
// would mean either a missing required tool or an out-of-scope one (§6: no
// per-annotation styling control, no notes/comment tool for editors, no
// cover-page/stamp/callout/redaction tool) slipped into the shipped toolbar.
test('5.1: the edit toolbar exposes exactly the 11 required tools, in A1\'s required order, and nothing out-of-scope', () => {
  renderToolbar('edit');

  const REQUIRED_TOOL_TEST_IDS = [
    TEST_IDS.TOOL_PEN,
    TEST_IDS.TOOL_FREEFORM_HIGHLIGHTER,
    TEST_IDS.TOOL_TEXT,
    TEST_IDS.TOOL_TEXT_HIGHLIGHTER,
    TEST_IDS.TOOL_ELLIPSE,
    TEST_IDS.TOOL_RECTANGLE,
    TEST_IDS.TOOL_LINE,
    TEST_IDS.TOOL_ARROW,
    TEST_IDS.TOOL_CLOUD,
    TEST_IDS.TOOL_POLYGON,
    TEST_IDS.TOOL_SIGNATURE,
  ];

  const toolbar = screen.getByTestId(TEST_IDS.ANNOTATION_TOOLBAR);
  const buttons = Array.from(toolbar.querySelectorAll('button[data-testid]'));
  assert.deepEqual(
    buttons.map((button) => button.getAttribute('data-testid')),
    REQUIRED_TOOL_TEST_IDS,
  );

  // §6 Out of Scope: no notes/comment control for an editor (view-only-only,
  // per P4), and only one global style control, not a per-annotation one.
  assert.equal(screen.queryByTestId(TEST_IDS.NOTES_BUTTON), null);
  assert.equal(screen.getAllByTestId(TEST_IDS.STYLE_COLOR_PICKER).length, 1);
});
