#!/usr/bin/env node
/**
 * PreToolUse hook: block Edit/Write to a file under supabase/migrations/ that
 * is already tracked by git (i.e. already committed / already applied).
 * Migrations in this repo are additive — a schema change is a NEW migration
 * file, never an edit to an old one. See CLAUDE.md's "Hooks" section and
 * agents/skills/database.md.
 *
 * Fails open: if git isn't available or the check itself errors, the edit is
 * allowed rather than blocked — this hook should never be the reason a
 * legitimate edit (e.g. to a migration you just created and haven't
 * committed yet) gets stuck.
 */
const { execSync } = require('child_process');
const path = require('path');

let raw = '';
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.stdout.write(raw);
    return;
  }

  const filePath = input.tool_input?.file_path || '';
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  if (!/supabase[\\/]migrations[\\/].*\.sql$/.test(filePath)) {
    process.stdout.write(raw);
    return;
  }

  const relPath = path.isAbsolute(filePath)
    ? path.relative(projectDir, filePath)
    : filePath;

  try {
    execSync(`git ls-files --error-unmatch -- "${relPath}"`, {
      cwd: projectDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // Exit code 0 means the file IS tracked — it was already committed, so
    // editing it in place would rewrite an already-applied migration.
    console.error(`[migration-guard] BLOCKED: ${relPath} is already committed.`);
    console.error('[migration-guard] Migrations are additive in this repo — create a new file instead');
    console.error('[migration-guard] (e.g. supabase/migrations/<new-timestamp>_<description>.sql),');
    console.error('[migration-guard] then run `npm run supabase:migrate` and regenerate Supabase types.');
    process.exit(1);
  } catch {
    // Not tracked yet (new, uncommitted file) or git check failed for any
    // other reason — allow the edit.
    process.stdout.write(raw);
  }
});
