/**
 * Presentation-never-touches-authority guardrail (Production Polish P-series).
 *
 * All rendering/audio/cosmetic systems are client-only. This test statically
 * asserts the authoritative layers (`shared/` and `server/`) never import a
 * rendering/presentation library or touch the DOM — so a skin, shader, tracer,
 * or post effect is physically incapable of changing a hitbox, movement, damage,
 * currency, or match outcome. If someone moves presentation into authority, this
 * fails.
 */

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...tsFiles(p));
    else if (entry.endsWith('.ts')) out.push(p);
  }
  return out;
}

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FORBIDDEN = [
  /from ['"]three['"]/,
  /from ['"]three\//,
  /from ['"]postprocessing['"]/,
  /from ['"]stats\.js['"]/,
  /\bdocument\./,
  /\bwindow\./,
];

describe('presentation never touches authority', () => {
  for (const pkg of ['shared/src', 'server/src']) {
    it(`${pkg} imports no rendering/DOM code`, () => {
      const offenders: string[] = [];
      for (const file of tsFiles(join(ROOT, pkg))) {
        const src = readFileSync(file, 'utf8');
        for (const rx of FORBIDDEN) {
          if (rx.test(src)) offenders.push(`${file.replace(ROOT, '')} :: ${rx}`);
        }
      }
      expect(offenders).toEqual([]);
    });
  }
});
