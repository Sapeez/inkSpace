---
name: generate-tasks
description: Generate a structured, phased task list from a feature request, PRD, or description. Saves the output to /tasks/tasks-[feature-name].md. Use when the user asks to generate tasks, create a task list, break down a feature into tasks, or says "generate tasks for...". Follows a two-phase process: first presents high-level parent tasks for approval, then expands into sub-tasks after the user confirms with "Go". Mirrors .cursor/skills/generate-tasks so Claude Code auto-invokes it too.
---

# Generate Tasks

Produce a phased, checkable task list from user requirements and save it to `/tasks/`.

## Process

### Phase 1 — Parent Tasks

1. Receive the requirement: a feature request, PRD, description, or pointer to an existing doc.
2. Analyze scope and implementation steps.
3. Create the `/tasks/` directory if it does not exist, then create `tasks-[feature-name].md`.
4. Write **parent tasks only** (no sub-tasks yet). Always include task `0.0 Create feature branch` as the first item unless the user explicitly says not to.
5. Use roughly 5 parent tasks total — adjust up or down based on scope.
6. Present the parent tasks to the user, then say exactly:

> "I have generated the high-level tasks based on your requirements. Ready to generate the sub-tasks? Respond with **'Go'** to proceed."

7. **Stop and wait.** Do not generate sub-tasks until the user responds with "Go".

### Phase 2 — Sub-Tasks (after "Go")

1. Break each parent task into small, actionable sub-tasks.
2. Identify all files that will be created or modified. Include corresponding test files — for inkSpace, unit/API tests are `node --test` files (`*.test.js`), not Jest, and browser-driven specs go under `tests/integration/<feature-area>/*.spec.ts` per `agents/rules/integration-tests.md`.
3. Write the complete output (see format below) into the file created in Phase 1.

## Output Format

The file must follow this structure exactly:

```
## Relevant Files

- `path/to/file.ts` - Why this file is relevant.
- `path/to/file.test.js` - Test for file.ts (node --test).

### Notes

- Unit tests should be placed alongside the source file they test where practical.
- Use `npm test` to run the test suite (Node's built-in runner — do not add Jest, Vitest, or Mocha).

## Instructions for Completing Tasks

**IMPORTANT:** Check off each task as you complete it by changing `- [ ]` to `- [x]`. Update after each sub-task, not only after finishing a parent task — see `agents/rules/git-workflow.md`.

## Tasks

- [ ] 0.0 Create feature branch
  - [ ] 0.1 Create and checkout a new branch (e.g., `git checkout -b feature/[feature-name]`)
- [ ] 1.0 Parent Task Title
  - [ ] 1.1 Sub-task description
  - [ ] 1.2 Sub-task description
- [ ] 2.0 Parent Task Title
  - [ ] 2.1 Sub-task description
```

## File Naming

- Save to `/tasks/tasks-[feature-name].md`
- `[feature-name]` is a short kebab-case slug of the feature (e.g. `tasks-pdf-viewer.md`, `tasks-user-auth.md`)

## Target Audience

Write for a junior developer. Be explicit, avoid jargon, and provide enough detail for them to understand the purpose of each task without needing to re-read the PRD.
