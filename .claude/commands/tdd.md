---
description: Test-first workflow for a feature or bug fix, using node --test only.
---

Invoke the `tdd-guide` subagent for: $ARGUMENTS

Write the failing test first (RED), tied to a specific requirement ID from the relevant task list where one applies. Run `npm test`, confirm the failure, then implement the minimal code to pass (GREEN), then refactor without changing behavior. Never introduce Jest, Vitest, or Mocha — this repo's test runner is `node --test` only (`AGENTS.md`, `agents/skills/testing.md`).
