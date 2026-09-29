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

function renderToolbar() {
  return render(
    <Toolbar
      attachmentId="attachment-1"
      activeTool="pen"
      onToolChange={() => {}}
      style={DEFAULT_ANNOTATION_STYLE}
      onStyleChange={() => {}}
      onSignaturePlace={() => false}
      onDownload={() => {}}
      downloading={false}
      downloadError={null}
      onSaveClick={() => {}}
    />,
  );
}

// 7.3/7.4: cross-account sharing is cut entirely — every caller who can
// reach a file is its owner, so there's a single always-editable toolbar,
// not a role switch.
test('the toolbar always shows the full annotation toolbar, Save, and Download', () => {
  renderToolbar();

  assert.ok(screen.getByTestId(TEST_IDS.ANNOTATION_TOOLBAR));
  assert.ok(screen.getByTestId(TEST_IDS.SAVE_BUTTON));
  assert.ok(screen.getByTestId(TEST_IDS.DOWNLOAD_BUTTON));
});

// 5.1: pins the shipped annotation toolbar to exactly A1's 11 tools (the 10
// gesture tools in their required order, plus Signature) — a regression here
// would mean either a missing required tool or an out-of-scope one (§6: no
// per-annotation styling control, no notes/comment tool for editors, no
// cover-page/stamp/callout/redaction tool) slipped into the shipped toolbar.
test('5.1: the toolbar exposes exactly the 11 required tools, in A1\'s required order, and nothing out-of-scope', () => {
  renderToolbar();

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

  // §6 Out of Scope: only one global style control, not a per-annotation one.
  assert.equal(screen.getAllByTestId(TEST_IDS.STYLE_COLOR_PICKER).length, 1);
});
