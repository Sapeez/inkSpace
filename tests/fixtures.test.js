import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');

describe('PRD appendix fixtures', () => {
  it('includes an already-timestamped filename', () => {
    const path = join(fixturesDir, 'already-timestamped_20250824T071530Z.pdf');
    assert.match(path, /_\d{8}T\d{6}Z\.pdf$/);
    assert.ok(statSync(path).size > 0);
  });

  it('includes a multi-page PDF placeholder', () => {
    const buf = readFileSync(join(fixturesDir, 'large-multipage.pdf'), 'utf8');
    assert.match(buf, /\/Count 3/);
  });

  it('includes an oversized image placeholder', () => {
    const path = join(fixturesDir, 'oversized-image.png');
    assert.ok(statSync(path).size > 0);
  });
});
