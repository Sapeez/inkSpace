---
description: Fix Vite build / tsc type errors with minimal diffs.
---

Invoke the `build-error-resolver` subagent to fix the current build/typecheck failure.

Run `npx tsc --noEmit --pretty` (or `npm run typecheck` once it exists) and `npm run build`, collect every error, fix the highest-leverage ones first, and never silence an error with `any` or `@ts-expect-error` — per `agents/rules/typescript-standard.md` §2.4, a `tsc` error surfaced during a mechanical fix is usually a real latent bug. Report the errors fixed, lines changed, and confirm `npm test` still passes.
