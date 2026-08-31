---
name: code-review
description: Review code, a diff, or a PR against this repo's rules. Use when the user asks to "review code", "review PR", "code review", "audit code", "check for bugs", "security review", "review my changes", or "review the diff". Full rules live in agents/rules/code-review.md; full process in agents/skills/code-review.md — this skill is the auto-invoke entry point.
---

# Code Review

Review changes to Brand You (React 19 + Vite, Node/Express, Supabase) against the project's own non-negotiables, not generic best practice alone.

## Process

1. **Read the rules first.** Read `agents/rules/code-review.md` in full before raising a single finding. If the diff touches `tests/integration/**`, also read `agents/rules/integration-tests.md` in full.
2. **Scope it.** Run `git diff` (or read the stated files/PR). Note which areas changed: `src/`, `server/`, `supabase/migrations/`, `tests/`, `tasks/*.md`, or config.
3. **Map to requirements.** If the change corresponds to a sub-task in `tasks/tasks-pdf-editor.md` or `tasks/tasks-accounts-workspace.md`, pull the requirement IDs (e.g. `WF4`, `S7`, `P2`, `R4`) referenced there — those are the acceptance criteria.
4. **Check the non-negotiables** in `agents/rules/code-review.md` §4, in priority order:
   - Server-side identity only (`req.user` from `requireAuth`, never a client-supplied ID)
   - Ownership/role check + `403` on every mutating endpoint (no IDOR); UI-only gating is never sufficient
   - Supabase service-role key never reachable from client code
   - Folder delete nulls `folder_id`, never deletes files; account delete is a real ordered cascade
   - Uploaded images re-encoded server-side, size limits enforced server-side too
   - Burn-in runs server-side via `pdf-lib`, never client-side only
   - Timestamps in UTC; filename validation boundary is exactly 255/256
   - Save-in-flight controls visibly disabled; save modal never auto-closes
   - No feature from the relevant PRD's "Out of Scope" (§3.4) list reintroduced
   - `node --test` only — flag any Jest/Vitest/Mocha addition
5. **Run the universal checklist** (security, correctness, performance, maintainability) from `agents/rules/code-review.md` §3 on every changed file.
6. **Write the review** using the template in `agents/rules/code-review.md` §5: Findings grouped CRITICAL → HIGH → MEDIUM → LOW, each with `file:line` (never fabricated), the concrete failure scenario, and the rule/requirement it violates, followed by specific suggested fixes and any deployment/test notes.

## Full reference

- [agents/rules/code-review.md](../../../agents/rules/code-review.md) — the authoritative rules and severity definitions
- [agents/skills/code-review.md](../../../agents/skills/code-review.md) — the full step-by-step process with a per-file-type rule-set lookup table
- [agents/rules/integration-tests.md](../../../agents/rules/integration-tests.md) — required for any `tests/integration/**` file
