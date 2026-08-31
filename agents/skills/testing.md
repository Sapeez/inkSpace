# Testing

- Test runner is Node's built-in `node --test`, invoked via `npm test` against `tests/**/*.test.js`. Do not introduce Jest, Vitest, or Mocha.
- Integration/burn-in tests use the fixtures in `tests/fixtures/` (see that folder's README): an already-timestamped PDF, a large multi-page PDF, and an oversized PNG for exercising `MAX_UPLOAD_BYTES`.
- The checked-in fixtures are placeholders — swap in real assets per `tests/fixtures/README.md` before running the full suite.
