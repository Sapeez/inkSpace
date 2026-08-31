# inkSpace — Integration Test Rules (Playwright)

These rules govern every Playwright integration test for the inkSpace PDF editor. Read and apply every rule before writing or reviewing a test file. When any rule conflicts with a general guideline, these inkSpace-specific rules take precedence.

---

## 1. Imports

Always import `test` and `expect` from `tests/fixtures/testFixtures`, never from `@playwright/test` directly. This enables automatic coverage collection when running with coverage enabled.

```ts
import { test, expect } from '../../fixtures/testFixtures';
import { TEST_IDS, TEXT_CONTENT, ITEM_FIELD_NAMES } from '../../consts/inkSpace';
import { Routes } from '../../consts/routes';
```

---

## 2. File Location

Place tests in `tests/integration/<feature-area>/<test-name>.spec.ts`, aligned to PRD phases:

| PRD Phase | Feature Area | Directory |
|-----------|-------------|-----------|
| Phase 1 — Viewer | PDF rendering, thumbnails, navigation, zoom/pan (V1–V8) | `tests/integration/viewer/` |
| Phase 2 — Annotations | Full toolbar, global styling, select/move/resize/delete (A1–A9) | `tests/integration/annotations/` |
| Phase 3 — Download & Save | Burn-in, download, save-as-new-attachment, filename rules (D1–D3, S1–S8, F1–F6) | `tests/integration/save/` |
| Phase 4 — Permissions | Email grants, edit/view split, empty states (P1–P5) | `tests/integration/permissions/` |
| Out-of-scope guards | Absent features (print, search, per-annotation styling, etc.) | `tests/integration/out-of-scope/` |

---

## 3. Selectors

Use `data-testid` attributes as the primary selector strategy. Import all constants from `tests/consts/inkSpace.ts` — never use raw strings.

```ts
// ✅
page.getByTestId(TEST_IDS.SAVE_BUTTON)

// ❌ Raw string
page.getByTestId('save-button')

// ❌ Class / ID selector
page.locator('.save-btn')
```

When using text-based selectors (`getByText`, `getByLabel`, `getByPlaceholder`), import the value from `TEXT_CONTENT` in `tests/consts/inkSpace.ts`.

### Missing `data-testid`

If a component lacks the required `data-testid`, **add it to the source component** using the value from the `TEST_IDS` table in Section 8. Do not create workarounds (text content, roles, class names) as substitutes for a missing testid.

---

## 4. Selectors & Constants Reference

### 4.1 Viewer (PRD V1–V8)

| Constant | `data-testid` | Notes |
|----------|--------------|-------|
| `TEST_IDS.PDF_VIEWER` | `pdf-viewer` | Outer viewer container |
| `TEST_IDS.LOADING_INDICATOR` | `pdf-loading-indicator` | Spinner shown during fetch/render (V2) |
| `TEST_IDS.THUMBNAILS_PANEL` | `thumbnails-panel` | Left sidebar, open by default (V3) |
| `TEST_IDS.THUMBNAIL_ITEM` | `thumbnail-item` | Individual page thumbnail (V3) |
| `TEST_IDS.PAGE_NAVIGATOR` | `page-navigator` | Navigation bar (V4) |
| `TEST_IDS.CURRENT_PAGE_INPUT` | `current-page-input` | Typed page-jump field (V4) |
| `TEST_IDS.PREV_PAGE_BUTTON` | `prev-page-button` | Previous page (V4) |
| `TEST_IDS.NEXT_PAGE_BUTTON` | `next-page-button` | Next page (V4) |
| `TEST_IDS.ZOOM_IN_BUTTON` | `zoom-in-button` | Zoom in (V5) |
| `TEST_IDS.ZOOM_OUT_BUTTON` | `zoom-out-button` | Zoom out (V5) |
| `TEST_IDS.FIT_WIDTH_BUTTON` | `fit-width-button` | Fit width (V7) |

### 4.2 Annotation Toolbar (PRD A1)

Toolbar order is fixed left-to-right: Pen group → Text group → Shapes group → Cloud → Polygon → Signature.

| Constant | `data-testid` | Tool |
|----------|--------------|------|
| `TEST_IDS.ANNOTATION_TOOLBAR` | `annotation-toolbar` | Toolbar container |
| `TEST_IDS.TOOL_PEN` | `tool-pen` | Pen (group default) |
| `TEST_IDS.TOOL_FREEFORM_HIGHLIGHTER` | `tool-freeform-highlighter` | Freeform highlighter |
| `TEST_IDS.TOOL_TEXT` | `tool-text` | Text (group default) |
| `TEST_IDS.TOOL_TEXT_HIGHLIGHTER` | `tool-text-highlighter` | Text highlighter |
| `TEST_IDS.TOOL_ELLIPSE` | `tool-ellipse` | Ellipse (shape group default) |
| `TEST_IDS.TOOL_RECTANGLE` | `tool-rectangle` | Rectangle |
| `TEST_IDS.TOOL_LINE` | `tool-line` | Line |
| `TEST_IDS.TOOL_ARROW` | `tool-arrow` | Arrow (one-sided) |
| `TEST_IDS.TOOL_CLOUD` | `tool-cloud` | Cloud — rectangle-based (A7) |
| `TEST_IDS.TOOL_POLYGON` | `tool-polygon` | Polygon |
| `TEST_IDS.TOOL_SIGNATURE` | `tool-signature` | Signature — upload image (A8) |
| `TEST_IDS.STYLE_COLOR_PICKER` | `style-color-picker` | Global color (default red, A4) |
| `TEST_IDS.STYLE_FILL_PICKER` | `style-fill-picker` | Global fill (default transparent, A4) |
| `TEST_IDS.STYLE_WIDTH_PICKER` | `style-width-picker` | Stroke width (default 4pt, A4) |

### 4.3 Download & Save (PRD D1–D3, S1–S8, F1–F6)

| Constant | `data-testid` | Notes |
|----------|--------------|-------|
| `TEST_IDS.DOWNLOAD_BUTTON` | `download-button` | Download with burn-in (D1) |
| `TEST_IDS.SAVE_BUTTON` | `save-button` | Opens "Save attachment" modal (S1) |
| `TEST_IDS.SAVE_MODAL` | `save-modal` | Modal container |
| `TEST_IDS.SAVE_MODAL_FILENAME_INPUT` | `save-modal-filename-input` | Filename field, pre-populated (S2) |
| `TEST_IDS.SAVE_MODAL_CONFIRM_BUTTON` | `save-modal-confirm-button` | Confirm / Save (S3) |
| `TEST_IDS.SAVE_MODAL_CANCEL_BUTTON` | `save-modal-cancel-button` | Cancel — disabled during save (S5) |
| `TEST_IDS.SAVE_MODAL_CLOSE_BUTTON` | `save-modal-close-button` | X close control — disabled during save (S5) |
| `TEST_IDS.SAVE_PROGRESS_INDICATOR` | `save-progress-indicator` | In-flight progress indicator (S4) |
| `TEST_IDS.SUCCESS_TOAST` | `success-toast` | Success feedback (S7) |
| `TEST_IDS.ERROR_TOAST` | `error-toast` | Failure feedback (S6) |
| `TEST_IDS.FILENAME_VALIDATION_ERROR` | `filename-validation-error` | Inline validation error (F4–F6) |

### 4.4 Delete Confirmation Modal (PRD A6)

| Constant | `data-testid` | Notes |
|----------|--------------|-------|
| `TEST_IDS.DELETE_CONFIRM_MODAL` | `delete-confirm-modal` | Modal — required before any delete |
| `TEST_IDS.DELETE_CONFIRM_TITLE` | `delete-confirm-title` | Must render `TEXT_CONTENT.DELETE_MODAL_TITLE` |
| `TEST_IDS.DELETE_CONFIRM_MESSAGE` | `delete-confirm-message` | Must render `TEXT_CONTENT.DELETE_MODAL_MESSAGE` |
| `TEST_IDS.DELETE_CONFIRM_BUTTON` | `delete-confirm-button` | Confirm delete |
| `TEST_IDS.DELETE_CANCEL_BUTTON` | `delete-cancel-button` | Cancel delete |

### 4.5 Permissions & Sharing (PRD P1–P5)

| Constant | `data-testid` | Notes |
|----------|--------------|-------|
| `TEST_IDS.SHARE_BUTTON` | `share-button` | Grant access by email (P1) |
| `TEST_IDS.SHARE_MODAL` | `share-modal` | Sharing modal |
| `TEST_IDS.SHARE_EMAIL_INPUT` | `share-email-input` | Email address field (P1) |
| `TEST_IDS.SHARE_ROLE_SELECT` | `share-role-select` | Edit / View-only role (P2) |
| `TEST_IDS.SHARE_CONFIRM_BUTTON` | `share-confirm-button` | Confirm grant |
| `TEST_IDS.EMPTY_STATE` | `empty-state` | No-permission / not-found state (P5) |
| `TEST_IDS.NOTES_BUTTON` | `notes-button` | View-only notes control (P4) |

### 4.6 Text & UI String Constants

Never use raw strings for PRD-specified UI text. Import from `TEXT_CONTENT`:

| Constant | Exact value |
|----------|-------------|
| `TEXT_CONTENT.DELETE_MODAL_TITLE` | `'Delete annotation?'` |
| `TEXT_CONTENT.DELETE_MODAL_MESSAGE` | `'Are you sure you want to delete this annotation?'` |
| `TEXT_CONTENT.VALIDATION_REQUIRED` | `'Required field'` |
| `TEXT_CONTENT.VALIDATION_MAX_LENGTH` | `'255 characters maximum'` |
| `TEXT_CONTENT.VALIDATION_INVALID_CHARS` | `'Invalid characters'` |

Success and failure toasts (S6, S7) include the attachment filename — construct the expected string dynamically using the mock's filename value, do not hardcode it.

### 4.7 Field Name Constants

Never use raw strings for attachment record field names. Import from `ITEM_FIELD_NAMES` in `tests/consts/inkSpace.ts`. Do **not** import `ItemFieldNames` from `src/consts` — that file pulls in browser-only dependencies that break the Playwright Node.js runner.

---

## 5. Test Naming

- Every test title uses the `should...` pattern.
- Prefix each title with a sequential number within its `describe` block: `1. should...`, `2. should...`.
- The title must describe observable, user-facing behavior — not an internal function or implementation detail.

```
✅  1. should display the thumbnails panel by default when a PDF is opened
✅  2. should jump to page 5 when "5" is typed into the page-number field
❌  1. should call renderThumbnails() on mount
❌  2. should update pageIndex state to 4
```

---

## 6. Test Structure

```ts
import { test, expect } from '../../fixtures/testFixtures';
import { TEST_IDS, TEXT_CONTENT, ITEM_FIELD_NAMES } from '../../consts/inkSpace';

test.describe('Viewer — Page navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/view/test-attachment-id');
    await page.waitForVisible(TEST_IDS.PDF_VIEWER);
  });

  test('1. should display the thumbnails panel by default', async ({ page }) => {
    await expect(page.getByTestId(TEST_IDS.THUMBNAILS_PANEL)).toBeVisible();
  });

  test('2. should navigate to page 3 when typed into the page field', async ({ page }) => {
    await page.fillText(TEST_IDS.CURRENT_PAGE_INPUT, '3');
    await expect(page.getByTestId(TEST_IDS.CURRENT_PAGE_INPUT)).toHaveValue('3');
  });
});
```

### `beforeEach` rules

- Must include `page.goto` navigation **and** a `waitForVisible` on the key element that confirms the page is ready.
- Only set up what the tests in that `describe` block actually use or depend on. Dead setup that no test in the block touches must be removed.

---

## 7. BasePage / Page Object Rules

- **Always** use `BasePage` helper methods — never raw Playwright functions:

  | Use | Never use |
  |-----|-----------|
  | `clickOnElement()` | `.click()` |
  | `fillText()` | `.fill()` |
  | `waitForVisible()` | `waitForSelector()` / `locator.waitFor()` |

- Add locators to a page object only when reused across multiple tests; otherwise define them inline.
- Add methods to a page object only when reused across multiple tests; otherwise keep logic inline.
- Page objects live in `tests/pages/`. Initialize them in `beforeEach`, not inside individual tests.
- Naming: descriptive, noun-based (`ViewerPage`, `SaveModalPage`, `AnnotationToolbarPage`).

---

## 8. Wait Strategy

- **No** `page.waitForTimeout()`. Use condition-based waits only.
- **No** redundant `waitForVisible` immediately before a call that already asserts visibility. These calls already guarantee visibility internally: `clickOnElement()`, `fillText()`, `expect(locator).toBeVisible()`, `expect(locator).toHaveText()`. Add `waitForVisible` only when no immediately following action guarantees it.
- **No** `page.evaluate()` for element interactions.

---

## 9. Asserting Actual State

After a state-changing action, assert the actual resulting state named in the test title — not only that a button appeared or a modal closed.

| Action | Assert |
|--------|--------|
| Selecting an annotation tool | The tool button carries an `aria-pressed="true"` attribute or active class reflected in the testid; the canvas accepts input for that tool |
| Saving a file | The POST to `/api/attachments` was made; the success toast displays the saved filename |
| Downloading | A download event fired or the network request to `/api/attachments/:id/download` was intercepted |
| Dismissing the delete modal via Cancel | The annotation still exists on the canvas |
| Typing an invalid filename | The inline validation error is visible with the exact message from `TEXT_CONTENT` |
| Save in progress | `SAVE_MODAL_FILENAME_INPUT`, `SAVE_MODAL_CANCEL_BUTTON`, and `SAVE_MODAL_CLOSE_BUTTON` are all disabled |
| Save modal after completion | The modal is still open (S8 — not auto-dismissed) |

Surface UI effects alone (a spinner disappearing, a button toggling) are not sufficient proof.

---

## 10. Visibility Consolidation

Do not write a dedicated "renders correctly" test for each element. Assert visibility of multiple elements inside a single functional test that already exercises the relevant user flow.

```ts
// ✅ Visibility asserted as part of the flow
test('1. should open the save modal when Save is clicked', async ({ page }) => {
  await page.clickOnElement(TEST_IDS.SAVE_BUTTON);
  await expect(page.getByTestId(TEST_IDS.SAVE_MODAL)).toBeVisible();
  await expect(page.getByTestId(TEST_IDS.SAVE_MODAL_FILENAME_INPUT)).toBeVisible();
  await expect(page.getByTestId(TEST_IDS.SAVE_MODAL_CONFIRM_BUTTON)).toBeVisible();
});

// ❌ Redundant standalone "renders" tests
test('1. should render save modal', async ({ page }) => { ... });
test('2. should render filename input', async ({ page }) => { ... });
test('3. should render confirm button', async ({ page }) => { ... });
```

---

## 11. API Mock Rules

### Registering a new endpoint

1. Add the route pattern to `tests/consts/routes.ts`.
2. Create a mock response file in `tests/mocks/inkspace/<endpoint>.mock.ts`.
3. Register in `tests/mocks/global/global.mocks.ts`:
   - **GET-only endpoints**: `context.route(Routes.AttachmentById, fulfillJson(attachmentMock))`
   - **Multiple HTTP methods**: use `mockRoute` from `tests/utils/mockRoute.ts`

### `mockRoute` vs `fulfillJson`

- Use `mockRoute` when the endpoint handles more than one HTTP method.
- Use `fulfillJson` for simple, read-only GET endpoints.
- For test-specific overrides, call `page.route()` with `mockRoute` inline — page-level routes take precedence over global ones. Use this pattern only for error/edge-case tests that need a single-test override.
- Never use inline `page.route` callbacks for endpoints already registered globally; use the override mechanism instead.

### Mock data mutation — accepted patterns

When reviewing integration test PRs:

- `handlePatch` handlers that mutate shared module-level mock data (`Object.assign(item, patchData)`) are intentional — they mirror real API persistence where PATCH updates server state and subsequent GETs return the updated data. Do not flag this.
- `fullyParallel: true` does not create cross-worker race conditions on shared mock data. Playwright workers run as separate Node.js processes with isolated module caches. Do not flag this.
- `findIndex` with characteristic-based lookups (not hardcoded indices) is intentional resilience against within-worker mutations. Do not flag this.

---

## 12. Feature Flags

All feature flags default to `true` (enabled). Only call `setFeatureFlags` to disable a flag or set a non-default value.

---

## 13. Test Independence & Grouping

- Each test must be focused on a single behavior with no dependencies on other tests.
- Group related tests with `test.describe()`.
- No redundant locator aliases within a single test — do not assign the same element to two variables under different names. Reuse the single variable.

---

## 14. Out-of-Scope Exclusion Tests

One test group verifies that out-of-scope capabilities from PRD §3.4 are absent. Place in `tests/integration/out-of-scope/out-of-scope.spec.ts`.

Required assertions — each item must be absent (not visible / not in the DOM):

- No print button or print trigger in the viewer
- No full-text search UI
- No per-annotation individual styling controls (only the single global style panel exists)
- No "notes" annotation tool in the toolbar for users with edit rights (`TOOL_NOTES` must not be present)
- Opening a non-PDF attachment renders the empty state, not the viewer

---

## 15. Permission Enforcement — API-Level Tests

Per PRD Risk R4, permission checks must be tested by calling the API directly, not only through the UI. Place in `tests/integration/permissions/permission-enforcement.spec.ts`.

Required cases:

| Scenario | Expected |
|----------|----------|
| View-only session POSTs to `Routes.BurnIn` | `403 Permission denied` |
| View-only session POSTs to `Routes.Attachments` | `403` or `401` |
| Unauthenticated request (no `x-user-id` header) to any protected route | `401 Authentication required` |

Use Playwright's `request` fixture (or `page.request`) to make direct API calls, bypassing the UI entirely.

---

## 16. Filename Validation Boundary Tests (PRD F4–F6)

Place in `tests/integration/save/filename-validation.spec.ts`. Cover every boundary case:

| Case | Input | Expected validation error |
|------|-------|--------------------------|
| Empty name | `''` | `TEXT_CONTENT.VALIDATION_REQUIRED` |
| Exactly 255 chars | 255-character string | No error (valid boundary) |
| 256 chars | 256-character string | `TEXT_CONTENT.VALIDATION_MAX_LENGTH` |
| OS-reserved characters | e.g. `report/draft` | `TEXT_CONTENT.VALIDATION_INVALID_CHARS` |
| Already-timestamped filename | e.g. `report_20250824T071530Z` | Timestamp replaced, not appended (F3) |

Use the fixture at `tests/fixtures/already-timestamped_20250824T071530Z.pdf` for the timestamp-replacement case.

---

## 17. No Comments in Test Code

Do not add comments in test code unless explicitly requested by the user.
