/**
 * verify-nls — Manifest NLS key-parity guard (plan 75 §2, System A).
 *
 * Asserts that the localization keys are aligned, in BOTH directions:
 *   1. every `%key%` referenced in package.json exists in package.nls.json and in
 *      every package.nls.<locale>.json (no MISSING keys), and
 *   2. every key defined in any package.nls*.json is actually referenced by
 *      package.json (no ORPHAN keys).
 *
 * VS Code substitutes an nls placeholder only when a field's value is EXACTLY
 * `%key%` (it does not do embedded substitution), so we match whole-value tokens
 * only — this also avoids false positives on URL-encoded `%5B…%` fragments that
 * live inside nls VALUES.
 *
 * IMPORTANT: this proves keys EXIST, not that values are TRANSLATED. A locale file
 * whose value is still English passes here. Value-coverage is a separate measure
 * (plan 75 §2, verify:nls-coverage). Never report parity as if it were coverage.
 *
 * Exit code 0 = aligned; 1 = drift (prints the offending keys). Wired into the
 * extension `compile` script so a stray `%key%` fails the build.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const extDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(extDir, 'package.json'), 'utf8'));

/** Collects keys from every string value that is exactly `%key%`. */
function collectReferencedKeys(node, out) {
  if (typeof node === 'string') {
    const m = /^%(.+)%$/.exec(node);
    if (m) out.add(m[1]);
  } else if (Array.isArray(node)) {
    for (const item of node) collectReferencedKeys(item, out);
  } else if (node && typeof node === 'object') {
    for (const v of Object.values(node)) collectReferencedKeys(v, out);
  }
}

const referenced = new Set();
collectReferencedKeys(pkg, referenced);

// Discover the base bundle + any per-locale bundles.
const nlsFiles = readdirSync(extDir).filter((f) => /^package\.nls(\.[\w-]+)?\.json$/.test(f));
if (!nlsFiles.includes('package.nls.json')) {
  console.error('verify-nls: FAIL — package.nls.json (English base) is missing.');
  process.exit(1);
}

const problems = [];

for (const file of nlsFiles) {
  const bundle = JSON.parse(readFileSync(join(extDir, file), 'utf8'));
  const keys = new Set(Object.keys(bundle));

  const missing = [...referenced].filter((k) => !keys.has(k));
  if (missing.length) {
    problems.push(`${file}: ${missing.length} MISSING key(s): ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ' …' : ''}`);
  }
  const orphans = [...keys].filter((k) => !referenced.has(k));
  if (orphans.length) {
    problems.push(`${file}: ${orphans.length} ORPHAN key(s): ${orphans.slice(0, 10).join(', ')}${orphans.length > 10 ? ' …' : ''}`);
  }
}

if (problems.length) {
  console.error('verify-nls: FAIL — manifest NLS key parity broken:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}

console.log(`verify-nls: OK — ${referenced.size} keys aligned across ${nlsFiles.length} bundle(s) [${nlsFiles.join(', ')}].`);
