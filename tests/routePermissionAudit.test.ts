import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

// 5.5: static sweep — every route that mutates an existing attachment or
// share must be gated by `requirePermission` (permissions.ts's chokepoint,
// per code-review.md §4.3), so a future route added without it fails this
// test at review time instead of silently shipping an IDOR. Read as source
// text, not imported: attachments.js/burn-in.js pull in `pdf-lib`
// transitively (via storage.ts/burn-in.ts), which isn't installed in this
// sandbox yet (spec.md §9) — this sweep must still work without it.
const ROUTE_FILES = ['server/routes/attachments.js', 'server/routes/burn-in.js', 'server/routes/shares.ts'];

// Matches `router.<method>('<path>', ...middleware, async (req, res...`,
// capturing everything between the path and the handler so
// `requirePermission` can be searched for within just that middleware list.
// Deliberately narrow (single-quoted path, `async` handler) — see
// LOOSE_ROUTE_CALL_PATTERN's comment below for why that narrowness is safe.
const ROUTE_CALL_PATTERN = /router\.(get|post|patch|put|delete)\(\s*'([^']*)'\s*,([\s\S]*?)async/g;

// Found in code review: ROUTE_CALL_PATTERN's own narrowness (single-quoted
// path, literal `async` handler) means a future route written with a
// double-quoted/template-literal path, or a synchronous (non-`async`)
// handler, would simply never match it at all — silently invisible to the
// sweep below, rather than failing it. Worse, a non-`async` handler could
// make the non-greedy `([\s\S]*?)async` capture scan forward into the
// *next* route's `async` keyword, potentially crediting an unguarded route
// with its neighbor's `requirePermission` call. This much looser pattern
// (just `router.<method>(`, any quote style, no handler-shape assumption)
// is used only to *count* call sites, as a canary: if this count ever
// diverges from ROUTE_CALL_PATTERN's own count, some route's actual shape
// has drifted out from under the strict pattern's assumptions, and a human
// needs to update it rather than the sweep silently missing that route.
const LOOSE_ROUTE_CALL_PATTERN = /router\.(get|post|patch|put|delete)\(/g;

// The one documented, intentional exception: creating a brand-new attachment
// row, always owned by the caller (`ownerId`, read from the request's own
// `x-user-id` header and checked inline) — this never mutates an existing
// resource, so there is no other attachment's permission to check. See this
// route's own comment in attachments.js and spec.md §3.4's "always owned by
// whoever saves them" note.
const EXEMPT = new Set(['server/routes/attachments.js:post:/']);

test('5.5: ROUTE_CALL_PATTERN sees every router.<method>(...) call site — no route shape has drifted out from under it', () => {
  for (const file of ROUTE_FILES) {
    const source = readFileSync(join(repoRoot, file), 'utf8');
    const strictCount = source.match(ROUTE_CALL_PATTERN)?.length ?? 0;
    const looseCount = source.match(LOOSE_ROUTE_CALL_PATTERN)?.length ?? 0;
    assert.equal(
      strictCount,
      looseCount,
      `${file}: found ${looseCount} router.<method>(...) call(s) but only ${strictCount} matched the strict, ` +
        `permission-checking pattern — a route was likely added in an unexpected style (non-single-quoted path, ` +
        `or a non-async handler) and is invisible to the sweep below; update ROUTE_CALL_PATTERN`,
    );
  }
});

test('5.5: every non-GET route across attachments/burn-in/shares is gated by requirePermission, except the one documented exception', () => {
  for (const file of ROUTE_FILES) {
    const source = readFileSync(join(repoRoot, file), 'utf8');
    let sawAnyMutatingRoute = false;
    let match: RegExpExecArray | null;
    ROUTE_CALL_PATTERN.lastIndex = 0;
    while ((match = ROUTE_CALL_PATTERN.exec(source))) {
      const [, method, routePath, middlewareChunk] = match;
      if (method === 'get') continue;
      sawAnyMutatingRoute = true;
      const key = `${file}:${method}:${routePath}`;
      if (EXEMPT.has(key)) continue;
      assert.match(
        middlewareChunk ?? '',
        /requirePermission/,
        `${key} must be gated by requirePermission (or added to this test's EXEMPT set with a documented reason)`,
      );
    }
    assert.ok(sawAnyMutatingRoute, `${file} should have at least one non-GET route for this sweep to be meaningful`);
  }
});
