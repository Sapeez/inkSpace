import { after } from 'node:test';
import globalJsdom from 'global-jsdom';

// Scoped per test file, not process-wide: `node --test` runs each file in its
// own child process by default, but a process-wide `--import` flag would still
// apply to every one of those processes, including non-DOM tests that make
// real network calls (permissions.test.ts) — jsdom's globals broke those.
export function setupJsdom() {
  const cleanup = globalJsdom();
  after(() => {
    cleanup();
  });
}
