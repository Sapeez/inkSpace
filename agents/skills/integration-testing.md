# Skill: Writing inkSpace Integration Tests (Playwright)

Use this skill when asked to write, review, or scaffold Playwright integration tests for any inkSpace feature area (viewer, annotations, save/download, permissions).

Follow every step in order. Do not skip steps.

---

## Step 1 — Read the Rules File First

Before writing a single line of test code, read `agents/rules/integration-tests.md` in full. Every decision you make must be consistent with those rules. This step is mandatory.

---

## Step 2 — Identify the Feature Area and PRD Scope

Map the task to the correct PRD phase and directory:

| What you are testing | Directory | PRD section |
|----------------------|-----------|-------------|
| PDF rendering, thumbnails, navigation, zoom | `tests/integration/viewer/` | V1–V8 |
| Annotation tools, global style, delete | `tests/integration/annotations/` | A1–A9 |
| Download, save modal, filename validation | `tests/integration/save/` | D1–D3, S1–S8, F1–F6 |
| Permissions, sharing, empty states | `tests/integration/permissions/` | P1–P5 |
| Out-of-scope absent features | `tests/integration/out-of-scope/` | §3.4 |

Create the directory if it does not exist.

---

## Step 3 — Check Whether Required `data-testid` Attributes Exist

Before writing selectors, grep the source component files for the `data-testid` values your tests will need (cross-reference with `TEST_IDS` in `tests/consts/inkSpace.ts`).

If any required `data-testid` is missing from the source:
1. Open the source component.
2. Add `data-testid={TEST_IDS.<CONSTANT>}` to the element. Use the constant's string value from `tests/consts/inkSpace.ts`.
3. Do not proceed with the test until the attribute exists in source.

---

## Step 4 — Check Whether Required API Mocks Exist

Inspect `tests/mocks/global/global.mocks.ts` and `tests/consts/routes.ts`.

For each API endpoint the tests will intercept:

- If the route pattern is missing from `tests/consts/routes.ts`, add it.
- If no mock exists, create one in `tests/mocks/inkspace/<endpoint>.mock.ts`.
- Register it in `global.mocks.ts` following the `mockRoute` vs `fulfillJson` rule (Section 11 of the rules file).

---

## Step 5 — Plan the Tests Before Writing

List the behaviors you will test. For each behavior, answer:

1. What user action triggers it?
2. What actual state change must be asserted (not just a surface UI effect)?
3. Does it belong in an existing `describe` block or a new one?
4. Does it need a page object, or will inline locators suffice?

Consolidate related visibility assertions into functional tests wherever possible (rules Section 10). Do not plan one test per visible element.

---

## Step 6 — Write the Test File

### File scaffold

```ts
import { test, expect } from '../../fixtures/testFixtures';
import { TEST_IDS, TEXT_CONTENT, ITEM_FIELD_NAMES } from '../../consts/inkSpace';
import { Routes } from '../../consts/routes';

test.describe('<Feature Area> — <Behavior Group>', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/view/<test-attachment-id>');
    await page.waitForVisible(TEST_IDS.<KEY_ELEMENT>);
  });

  test('1. should <observable behavior>', async ({ page }) => {
    // arrange (if needed)
    // act
    // assert actual state
  });
});
```

### Checklist while writing each test

- [ ] Test title starts with the sequential number and `should`
- [ ] Title describes user-facing behavior, not an internal function
- [ ] Imports come from `tests/fixtures/testFixtures`, `tests/consts/inkSpace`, `tests/consts/routes`
- [ ] All `data-testid` selectors use `TEST_IDS` constants (no raw strings)
- [ ] All UI text uses `TEXT_CONTENT` constants (no raw strings)
- [ ] All field names use `ITEM_FIELD_NAMES` constants (no raw strings)
- [ ] `BasePage` methods used everywhere (`clickOnElement`, `fillText`, `waitForVisible`)
- [ ] No `page.evaluate()` for element interactions
- [ ] No `page.waitForTimeout()`
- [ ] No redundant `waitForVisible` before a call that already asserts visibility
- [ ] Assertion targets actual state, not only a surface UI change (modal closed, spinner gone)
- [ ] Single behavior per test; no inter-test dependencies
- [ ] No comments added

---

## Step 7 — Handle the Save Modal (PRD S1–S8) Correctly

The save flow has several strict PRD requirements. When testing it:

**S5 — Disabled state during save**
Assert that `SAVE_MODAL_FILENAME_INPUT`, `SAVE_MODAL_CANCEL_BUTTON`, and `SAVE_MODAL_CLOSE_BUTTON` are all disabled while the save is in flight. Do not assert only that the progress indicator appeared.

**S8 — Modal stays open**
After a completed save (success or failure), assert that `SAVE_MODAL` is still visible. Do not assert only the toast.

**S6/S7 — Toast text includes the filename**
Construct the expected toast string dynamically from the mock's filename value:
```ts
const expectedToast = `${mockAttachment.filename} saved successfully to workspace.`;
await expect(page.getByTestId(TEST_IDS.SUCCESS_TOAST)).toHaveText(expectedToast);
```

**F3 — Timestamp replacement**
When testing a pre-timestamped filename, load `tests/fixtures/already-timestamped_20250824T071530Z.pdf` as the attachment and assert that the pre-populated filename field contains a single, replaced timestamp — not the original timestamp plus a new one appended.

---

## Step 8 — Handle Permission Tests (PRD P1–P5) Correctly

**UI-level tests** (in `tests/integration/permissions/`):
- View-only user: assert that `ANNOTATION_TOOLBAR` and `SAVE_BUTTON` are absent from the DOM (not just hidden).
- View-only user: assert that `NOTES_BUTTON` is visible.
- Empty state: assert `EMPTY_STATE` is visible when the attachment does not exist or the user has no access grant.

**API-level tests** (in `tests/integration/permissions/permission-enforcement.spec.ts`):
Use `page.request` to call the API directly, bypassing the UI. These tests must not use the annotation toolbar or save button — they call the raw endpoints.
```ts
const response = await page.request.post(`/api/burn-in/test-attachment-id`, {
  headers: { 'x-user-id': 'view-only-user-id' },
  data: { annotations: [] },
});
expect(response.status()).toBe(403);
```

---

## Step 9 — Write Out-of-Scope Exclusion Tests (When Applicable)

When working on any PRD phase, check whether the out-of-scope file (`tests/integration/out-of-scope/out-of-scope.spec.ts`) already covers the corresponding exclusion. If not, add the assertion:

- Absent elements must be asserted with `expect(locator).not.toBeVisible()` or `expect(locator).toHaveCount(0)` — not `toBeHidden()`, which passes for elements that are hidden but still in the DOM.

---

## Step 10 — Self-Review Before Finishing

Run through this final checklist against every test you wrote:

### Rules compliance
- [ ] Import comes from `tests/fixtures/testFixtures`, not `@playwright/test`
- [ ] File is in the correct `tests/integration/<feature-area>/` directory
- [ ] No raw selector strings — all from `TEST_IDS`, `TEXT_CONTENT`, `ITEM_FIELD_NAMES`
- [ ] `BasePage` methods used throughout (no raw `.click()`, `.fill()`, `waitForSelector()`)
- [ ] No `page.evaluate()` for element interactions
- [ ] No `page.waitForTimeout()`
- [ ] No redundant `waitForVisible` before a visibility-asserting call

### Test quality
- [ ] Each test title matches what it actually asserts
- [ ] Each test asserts actual resulting state, not only surface UI effects
- [ ] Visibility checks are consolidated inside functional tests, not standalone
- [ ] `beforeEach` contains only setup that the tests in the block actually use
- [ ] No inter-test dependencies
- [ ] No comments (unless explicitly requested)
- [ ] No redundant locator aliases within a single test

### Source completeness
- [ ] Every `data-testid` used in tests exists in the source component
- [ ] Every API route used is registered in `tests/consts/routes.ts` and `global.mocks.ts`
- [ ] The `tests/consts/inkSpace.ts` constant file has an entry for every new testid introduced

---

## Quick Reference — Key File Locations

| Purpose | Path |
|---------|------|
| Test fixtures (custom) | `tests/fixtures/testFixtures.ts` |
| Selector / field name constants | `tests/consts/inkSpace.ts` |
| API route patterns | `tests/consts/routes.ts` |
| Global mocks registration | `tests/mocks/global/global.mocks.ts` |
| inkSpace mock data | `tests/mocks/inkspace/` |
| Page objects | `tests/pages/` |
| Mock utility | `tests/utils/mockRoute.ts` |
| PDF fixtures | `tests/fixtures/` |
| Full rules reference | `agents/rules/integration-tests.md` |
