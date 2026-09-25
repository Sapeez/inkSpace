#!/usr/bin/env node
/**
 * PostToolUse hook: after an Edit/Write to a .ts/.tsx file, run `tsc --noEmit`
 * and surface any errors that mention the just-edited file, before they reach
 * `npm test`. See agents/rules/typescript-standard.md §2.2/§3.3 and
 * CLAUDE.md's "Hooks" section for why this exists.
 *
 * Fails open: any problem running tsc (not installed yet, no tsconfig, etc.)
 * is silently skipped rather than blocking the edit — this is a courtesy
 * check, not a gate. `npm run typecheck` in CI / before a PR is the real gate.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let raw = '';
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  // Always pass the original payload through so the tool pipeline continues.
  process.stdout.write(raw);

  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return;
  }

  const filePath = input.tool_input?.file_path || '';
  if (!/\.(ts|tsx)$/.test(filePath)) return;

  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (!fs.existsSync(path.join(projectDir, 'tsconfig.json'))) return;

  try {
    execSync('npx --no-install tsc --noEmit --pretty false', {
      cwd: projectDir,
      encoding: 'utf8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // No errors at all — nothing to report.
  } catch (err) {
    if (err.status === undefined) return; // tsc not installed / npx failed to resolve it — skip silently
    const output = `${err.stdout || ''}${err.stderr || ''}`;
    const relevant = output
      .split('\n')
      .filter((line) => line.includes(filePath))
      .slice(0, 15);
    if (relevant.length) {
      console.error(`[typecheck] tsc --noEmit found issues in ${filePath}:`);
      console.error(relevant.join('\n'));
      console.error('[typecheck] Run `npm run typecheck` for the full picture. Do not silence with `any` — see agents/rules/typescript-standard.md §2.4.');
    }
  }
});
