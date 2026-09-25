---
description: Write and run Playwright integration tests for a feature area, per agents/rules/integration-tests.md.
---

Invoke the `e2e-runner` subagent for: $ARGUMENTS

The subagent reads `agents/rules/integration-tests.md` in full before writing anything, places the spec under the correct `tests/integration/<feature-area>/` directory, checks for missing `data-testid`s and API mocks first, writes the spec using only `testFixtures`/`TEST_IDS`/`TEXT_CONTENT`/`BasePage` (no raw Playwright calls, no comments), and actually runs it before reporting results.
