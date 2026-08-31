# Skill: Reviewing Code for Brand You

Use this skill when asked to review code, review a PR, review a diff, audit code, check for bugs, or do a security review on any part of this repo.

Follow every step in order. Do not skip steps.

---

## Step 1 — Read the Rules File First

Before writing a single finding, read [agents/rules/code-review.md](../rules/code-review.md) in full. Every finding you raise must be consistent with those rules, including the severity given to it. This step is mandatory.

If the diff touches anything under `tests/integration/**`, also read [agents/rules/integration-tests.md](../rules/integration-tests.md) in full — it governs Playwright specs and takes precedence over generic test-review instincts.

---

## Step 2 — Scope the Review

1. Run `git diff` (or read the stated PR/branch/files) to see exactly what changed.
2. Note which top-level areas are touched: `src/` (frontend), `server/` (backend), `supabase/migrations/` (schema), `tests/` (any kind), `tasks/*.md` or `agents/**` (process/docs), or config (`package.json`, `.env.example`, `vite.config.js`).
3. If the change maps to a task in `tasks/tasks-pdf-editor.md` or `tasks/tasks-accounts-workspace.md`, find the exact sub-task and its requirement IDs (e.g. `WF4`, `A6`, `S7`, `P2`, `R4`). These IDs are your acceptance criteria for that change.

---

## Step 3 — Pick the Applicable Rule Sets

| File touched | Also apply |
|---|---|
| `tests/integration/**/*.spec.ts` | `agents/rules/integration-tests.md` in full |
| `tests/**/*.test.js` | `agents/skills/testing.md` (runner constraint: `node --test` only) |
| `supabase/migrations/**` | `agents/skills/database.md` (service role vs anon key, migration flow) |
| `server/**`, anything touching env vars | `agents/skills/deployment.md` |
| `server/middleware/permissions.js`, `requireAuth.js`, any route handler | §4.2/§4.3 of `agents/rules/code-review.md` (auth & authorization) |
| `DeleteAccountModal`, `DeleteFolderModal`, account/folder delete endpoints | §4.4 of `agents/rules/code-review.md` (destructive/cascading ops) |
| `SignatureUploader`, upload endpoints | §4.5 of `agents/rules/code-review.md` (upload safety) |
| `server/services/burn-in.js`, `AnnotationCanvas.jsx` | §4.6 of `agents/rules/code-review.md` (burn-in & coordinate space) |
| `filenameUtils.js`, anything using `Date` | §4.7 of `agents/rules/code-review.md` (filenames & UTC timestamps) |
| `SaveModal.jsx` | §4.8 of `agents/rules/code-review.md` (in-flight UI state, exact copy) |
| Any new route, page, or UI control | §4.9 of `agents/rules/code-review.md` (out-of-scope check against the relevant PRD §3.4) |
| `tasks/*.md` | §4.10 of `agents/rules/code-review.md` (checkbox hygiene) |

---

## Step 4 — Walk the Universal Checklist

For every changed file, run through Security / Correctness / Performance / Maintainability from §3 of the rules file. Don't skip files just because they look like "just UI" — most of the CRITICAL findings in this repo (auth, authorization, destructive deletes) surface in UI code that calls a server endpoint incorrectly, or in a server endpoint missing a check the UI assumed existed.

---

## Step 5 — Cross-Check Requirement IDs

For each requirement ID identified in Step 2, confirm the implementation matches it *literally* where the task list is literal (exact modal title/body text, exact toolbar order, exact HTTP status code, exact toast string) and matches it *functionally* where the task list describes behavior. A plausible-looking implementation that quietly drifts from a literal requirement (e.g. `404` instead of the specified `403`, or paraphrased modal copy) is a finding — cite the requirement ID it violates.

---

## Step 6 — Write the Review

Use the Output Format and Review Template from §5 of `agents/rules/code-review.md`:

1. Context Questions (only if genuinely blocking, tied to a requirement ID)
2. Findings — CRITICAL → HIGH → MEDIUM → LOW, each with `file:line` (or function name + quoted snippet if no line number), the concrete failure scenario, and which rule/requirement it violates
3. Suggested Fixes — specific, small, not full rewrites
4. Deployment/Test Notes — migration needed? env var needed? re-run `npm test`?

Never fabricate a line number. Acknowledge good patterns, especially correct handling of one of the non-negotiables in §4 of the rules file.

---

## Step 7 — Self-Review Before Finishing

- [ ] Every CRITICAL/HIGH finding traces to a specific rule in `agents/rules/code-review.md` or a specific requirement ID in a task file
- [ ] No line numbers were guessed
- [ ] Test-file findings were checked against `integration-tests.md` if under `tests/integration/**`, or the `node --test`-only constraint otherwise
- [ ] Scope violations were checked against the relevant PRD's out-of-scope list, not just "is this code good"
- [ ] Findings are actionable (a specific fix, not "add validation")
- [ ] Good patterns were acknowledged, not just problems
