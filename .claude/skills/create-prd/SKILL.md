---
name: create-prd
description: Generate a Product Requirements Document from an initial feature prompt. Use when the user asks to write a PRD, create a PRD, spec out a feature, or says "generate a PRD for...". No .cursor/skills equivalent exists yet for this one — Cursor users still invoke agents/rules/createprd.md manually.
---

# Create PRD

Guide the creation of a clear, actionable PRD from an initial user prompt, following `agents/rules/createprd.md` exactly.

## Process

1. **Receive the initial prompt** — a brief feature description or request.
2. **Ask only the most essential clarifying questions** (3–5 max) — problem/goal, core functionality, scope/boundaries, success criteria, whichever of these the prompt leaves ambiguous. Number questions, letter the options (A/B/C/D) so the user can reply "1A, 2C, 3B".
3. **Generate the PRD** using the structure in `agents/rules/createprd.md`: Introduction/Overview, Goals, User Stories, Functional Requirements (numbered), Non-Goals (Out of Scope), Design Considerations, Technical Considerations, Success Metrics, Open Questions.
4. **Save** as `/tasks/prd-[feature-name].md`.

Write for a junior developer audience — explicit, unambiguous, minimal jargon.

## Final instructions

1. Do NOT start implementing the PRD.
2. Always ask the clarifying questions before writing — don't skip straight to a full PRD from an ambiguous prompt.
3. Incorporate the user's answers before finalizing.

## After the PRD is saved

Point the user at `/generate-tasks` (or the `generate-tasks` skill) to turn this PRD into a phased task list — don't generate tasks in the same pass as the PRD unless asked to.

## Full reference

[agents/rules/createprd.md](../../../agents/rules/createprd.md) — the authoritative process and PRD structure.
