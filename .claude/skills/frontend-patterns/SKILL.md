---
name: frontend-patterns
description: Component and API-wrapper conventions for inkSpace's React 19 + Vite frontend. Use when adding or modifying anything under src/ — routes, modals, toolbar, viewer, annotation-canvas, or the src/lib API client.
---

# Frontend Patterns — inkSpace

This repo's actual `src/` conventions, not generic React advice. Read `agents/rules/typescript-standard.md` §2.3/§2.6 first if the file you're touching is a TypeScript conversion candidate.

## Directory roles

| Directory | Role |
|---|---|
| `src/routes/` | Page-level components wired into `react-router-dom` (`App.jsx` defines the `<Routes>` tree). One route component per page; keep them thin, delegating real layout to the feature directories below. |
| `src/lib/` | The **only** place that calls `fetch`/the API. Every other component goes through `src/lib`, never calls `fetch` directly. `http.js` owns the base request wrapper (`API_BASE`, JSON headers, error unwrapping); `fetch.js`/`create.js`/`change.js`/`remove.js` are read/create/update/delete wrappers re-exported from `index.js`. |
| `src/toolbar/`, `src/viewer/`, `src/annotation-canvas/` | Feature components with real runtime behavior (PDF rendering, canvas layering). `ViewerPage` composes `Toolbar` + `AnnotationCanvas`, passing down `attachmentId` from the route param — keep that composition pattern rather than having children read `useParams()` themselves. |
| `src/modals/` | Confirmation/action modals (`ConfirmModal.jsx` today; `DeleteAccountModal`, `DeleteFolderModal`, `SaveModal`, `ShareModal` as the accounts-workspace and PDF-editor features land). |
| `src/styles/` | Plain CSS, no CSS-in-JS. |

## The `src/lib` wrapper pattern

Every new API call is a small named function added to the matching file (`fetchX` in `fetch.js`, `createX` in `create.js`, etc.), built on `request()` from `http.js` — never a raw `fetch()` call scattered through a component:

```js
// src/lib/fetch.js
export function fetchWorkspace(workspaceId) {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}`);
}
```

When converting a wrapper to TypeScript (`agents/rules/typescript-standard.md` §2.3, highest-value conversion target), type both the request and response shape — don't just add a return-type annotation to the existing untyped body:

```ts
interface Workspace {
  id: string;
  displayName: string;
  createdAt: string;
}

export function fetchWorkspace(workspaceId: string): Promise<Workspace> {
  return request(`/api/workspaces/${encodeURIComponent(workspaceId)}`);
}
```

## Component conventions

- Function components, props destructured directly in the parameter list — no `React.FC`, no class components:
  ```jsx
  export default function Toolbar({ attachmentId }) {
    return (/* ... */);
  }
  ```
- Default export for the one component a route/feature file defines; named exports for anything else in the same file.
- `data-testid` on every element a Playwright spec needs, using the exact string from `TEST_IDS` in `tests/consts/inkSpace.ts` (`agents/rules/integration-tests.md` §3) — add the testid to the source component when the spec needs one that doesn't exist yet, don't work around it in the test.
- Confirmation modals: title/body copy must match the task list verbatim (`code-review.md` §4.4) — pull it from a typed constants object (`agents/rules/typescript-standard.md` §2.4) once the component is TS, not an inline string, so a copy drift from the requirement is a single place to check, not a grep across components.
- Async actions with visible progress (save, upload) disable their controls **visibly** — a `disabled` prop with no matching style change is a review finding (`code-review.md` §4.8). Never auto-close a modal on completion unless the task list says to.
- Accessibility: `role`/`aria-label` on custom interactive containers (see `Toolbar`'s `role="toolbar"` and `AnnotationCanvas`'s `aria-label`) — keep this pattern for new custom controls rather than relying on default semantics of a `<div>`.

## Out-of-scope reminder

Before adding a new route, control, or feature, check it against the relevant PRD's §3.4 Out of Scope list (print, in-app full-text search, per-annotation individual styling, multi-workspace switching, 2FA, etc.) — `code-review.md` §4.9 flags this even when the implementation itself is clean.

## When touching this code, also check

- `agents/rules/code-review.md` §4.6 if the change is anywhere in `annotation-canvas` (coordinate space must be normalized to PDF points, not pixels tied to zoom).
- `agents/rules/integration-tests.md` if the change affects a selector, text string, or flow a Playwright spec depends on — update the spec and `tests/consts/inkSpace.ts` in the same PR, not as a follow-up.
