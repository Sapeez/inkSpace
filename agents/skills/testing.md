# Testing

- Test runner is Node's built-in `node --test`, invoked via `npm test` against `tests/*.test.js`, `tests/*.test.ts`, and `tests/*.test.tsx`. Do not introduce Jest, Vitest, or Mocha.
- Integration/burn-in tests use the fixtures in `tests/fixtures/` (see that folder's README): an already-timestamped PDF, a large multi-page PDF, and an oversized PNG for exercising `MAX_UPLOAD_BYTES`.
- The checked-in fixtures are placeholders — swap in real assets per `tests/fixtures/README.md` before running the full suite.

## Component tests (React, via jsdom)

For any `src/` component that needs real rendering/DOM assertions (not just Playwright), use `jsdom` +
`@testing-library/react` — still under `node --test`, not a competing framework:

1. Name the file after the component under test, `.tsx` since it renders JSX: `tests/ComponentName.test.tsx`.
2. Call `setupJsdom()` from `tests/setup/jsdom.ts` as the first statement in the file, then load
   `@testing-library/react` and the component under test via `await import(...)` (dynamic, not a static
   `import` at the top) — static imports are hoisted and would evaluate before `setupJsdom()` runs.
3. **Never** wire jsdom in process-wide (e.g. via a `--import` CLI flag on the `npm test` script). `node
   --test` runs each matched file in its own child process by default, but a process-wide CLI flag still
   applies to *every* one of those processes — including non-DOM test files that make real network calls
   (`permissions.test.ts`), where jsdom's globals broke the request flow and hung the run. Scoping the
   setup call to only the files that import it keeps it out of every other test file's process.

See `tests/PDFViewer.test.tsx` and `tests/PageNavigator.test.tsx` for the working pattern.
