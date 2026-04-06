/**
 * Shared test utilities for the web theme contract tests.
 *
 * Extracted from web-theme-contract.test.ts so that multiple test
 * files (style.css tests, drift-enhanced.css tests, app.js tests)
 * can share the same helper functions without duplicating code.
 */
import * as fs from 'fs';
import * as path from 'path';

/**
 * Root of the repository, resolved relative to the compiled test
 * output directory. From extension/src/test/ that means climbing
 * three levels: test → src → extension → repo root.
 */
export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

/**
 * Read a file relative to the repo root, decoded as UTF-8.
 *
 * @param relPath - Path relative to the repository root, e.g.
 *   'assets/web/style.css' or 'web/drift-enhanced.css'.
 * @returns The full file contents as a string.
 */
export function readAsset(relPath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relPath), 'utf-8');
}

/**
 * Extract the first CSS rule block for a given selector prefix.
 *
 * Scans `css` for a line containing `selector`, then captures
 * everything up to and including the matching closing `}`. Good
 * enough for single-level blocks with no nested braces.
 *
 * @param css - The full CSS source string to search.
 * @param selector - A substring that identifies the start of the
 *   rule block (e.g. 'body.theme-light').
 * @returns The matched block including selector and braces, or
 *   an empty string if the selector is not found.
 */
export function extractBlock(css: string, selector: string): string {
  // Locate the selector text within the CSS source.
  const start = css.indexOf(selector);
  if (start === -1) return '';

  // Find the opening brace after the selector.
  const braceOpen = css.indexOf('{', start);
  if (braceOpen === -1) return '';

  // Simple brace-depth counter for non-nested blocks.
  // Walk forward from the opening brace, incrementing on '{' and
  // decrementing on '}', until depth returns to zero.
  let depth = 0;
  let end = braceOpen;
  for (let i = braceOpen; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}') depth--;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }

  return css.substring(start, end);
}
