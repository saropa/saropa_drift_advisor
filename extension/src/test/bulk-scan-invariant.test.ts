/**
 * Architecture invariant: bulk Dart-source scans must NOT use
 * workspace.openTextDocument(). That fires onDidOpenTextDocument into every
 * listening extension and promotes files with the Dart analysis server.
 * Use readSourceText() from dart-source-reader.ts instead.
 *
 * This test reads the source files that perform workspace-wide findFiles()
 * loops and asserts none of them call openTextDocument on the scanned URIs.
 * When converting a bulk-scan site, remove it from KNOWN_UNCONVERTED and
 * add it to CONVERTED_SITES.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// Relative to the compiled out/ directory at runtime; resolve back to src/.
const SRC_ROOT = path.resolve(__dirname, '..', '..', 'src');

/** Sites already converted to readSourceText — must stay clean. */
const CONVERTED_SITES = [
  'definition/drift-source-locator.ts',
  'decorations/file-decoration-provider.ts',
];

/**
 * Known unconverted bulk-scan sites that still use openTextDocument.
 * Each entry is tracked so the test fails when a site is converted
 * (remove the entry) or when a NEW site appears (add it here or convert it).
 */
const KNOWN_UNCONVERTED = [
  'diagnostics/dart-file-parser.ts',
  'invariants/invariant-diagnostics.ts',
  'migration-gen/migration-gen-commands.ts',
  'schema-diff/schema-diff-commands.ts',
];

/**
 * Detect whether a source file contains the bulk-scan anti-pattern:
 * openTextDocument() called inside a for-loop that iterates over file URIs.
 *
 * The heuristic looks for openTextDocument appearing within ~10 lines of a
 * `for (... of ...` loop. A standalone openTextDocument (e.g.
 * openLocationOrNotify navigating the user to a single file) is fine.
 */
function hasBulkScanAntiPattern(source: string): boolean {
  if (!source.includes('findFiles') || !source.includes('openTextDocument')) {
    return false;
  }
  // Split into lines and look for openTextDocument within a for-of block.
  const lines = source.split('\n');
  let insideForOf = false;
  let forOfDepth = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/for\s*\(.*\bof\b/.test(trimmed)) {
      insideForOf = true;
      forOfDepth = 0;
    }
    if (insideForOf) {
      // Track brace depth to know when the loop ends.
      forOfDepth += (trimmed.match(/\{/g) || []).length;
      forOfDepth -= (trimmed.match(/\}/g) || []).length;
      if (trimmed.includes('openTextDocument')) {
        return true;
      }
      // Loop body ended (braces balanced back to 0 after at least one open).
      if (forOfDepth <= 0 && trimmed.includes('}')) {
        insideForOf = false;
      }
    }
  }
  return false;
}

describe('bulk-scan architecture invariant', () => {
  it('converted sites must not regress to openTextDocument', () => {
    for (const relPath of CONVERTED_SITES) {
      const filePath = path.join(SRC_ROOT, relPath);
      if (!fs.existsSync(filePath)) {
        // File was moved or renamed — skip rather than fail.
        continue;
      }
      const source = fs.readFileSync(filePath, 'utf-8');
      assert.ok(
        !hasBulkScanAntiPattern(source),
        `${relPath} regressed: uses openTextDocument in a findFiles context. ` +
          'Use readSourceText() from dart-source-reader.ts instead.',
      );
    }
  });

  it('known unconverted sites are still tracked', () => {
    // If a known-unconverted site no longer has the anti-pattern, it was
    // converted — remove it from KNOWN_UNCONVERTED.
    for (const relPath of KNOWN_UNCONVERTED) {
      const filePath = path.join(SRC_ROOT, relPath);
      if (!fs.existsSync(filePath)) {
        assert.fail(
          `${relPath} no longer exists — remove it from KNOWN_UNCONVERTED.`,
        );
      }
      const source = fs.readFileSync(filePath, 'utf-8');
      if (!hasBulkScanAntiPattern(source)) {
        assert.fail(
          `${relPath} was converted to readSourceText — remove it from ` +
            'KNOWN_UNCONVERTED and add it to CONVERTED_SITES.',
        );
      }
    }
  });

  it('no new unconverted bulk-scan sites appear without being tracked', () => {
    // Walk all .ts files under src/ (excluding test/) and flag any that have
    // the anti-pattern but are not in either list.
    const allTracked = new Set([...CONVERTED_SITES, ...KNOWN_UNCONVERTED]);
    const untracked: string[] = [];

    function walkDir(dir: string): void {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          // Skip test/ and node_modules/.
          if (entry.name === 'test' || entry.name === 'node_modules') continue;
          walkDir(path.join(dir, entry.name));
        } else if (entry.name.endsWith('.ts')) {
          const fullPath = path.join(dir, entry.name);
          const relPath = path.relative(SRC_ROOT, fullPath).replace(/\\/g, '/');
          if (!allTracked.has(relPath)) {
            const source = fs.readFileSync(fullPath, 'utf-8');
            if (hasBulkScanAntiPattern(source)) {
              untracked.push(relPath);
            }
          }
        }
      }
    }

    walkDir(SRC_ROOT);

    assert.deepStrictEqual(
      untracked,
      [],
      'New bulk-scan sites found that use openTextDocument with findFiles. ' +
        'Either convert them to readSourceText() or add them to KNOWN_UNCONVERTED:\n' +
        untracked.map((f) => `  - ${f}`).join('\n'),
    );
  });
});
