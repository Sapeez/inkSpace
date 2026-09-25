---
description: Generate a phased task list from a PRD or feature description, following agents/rules/generatetasks.md.
argument-hint: [PRD path or feature description]
---

Follow `agents/rules/generatetasks.md` exactly for: $ARGUMENTS

Phase 1: generate parent tasks only (always including `0.0 Create feature branch` first unless told not to), present them, then say exactly: "I have generated the high-level tasks based on your requirements. Ready to generate the sub-tasks? Respond with 'Go' to proceed." and stop.

Phase 2 (after the user replies "Go"): expand into sub-tasks, list relevant files, and save to `/tasks/tasks-[feature-name].md` in the required format.
