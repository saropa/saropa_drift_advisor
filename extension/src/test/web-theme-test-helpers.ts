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
  // A naive first-indexOf match grabs compound/descendant selectors like
  // "body.theme-dark ::-webkit-scrollbar-thumb { ... }" when searching
  // for "body.theme-dark".  To avoid this, after each match we check
  // that the first non-whitespace character following the selector text
  // is '{' or ',' (a direct rule or selector list), not a descendant
  // combinator or pseudo-element that extends the selector.
  let searchFrom = 0;
  while (searchFrom < css.length) {
    const start = css.indexOf(selector, searchFrom);
    if (start === -1) return '';

    // Check the character immediately after the matched selector text.
    // If the next non-whitespace char is '{' or ',' this occurrence is
    // the selector itself (possibly in a selector list).  Anything else
    // (e.g. ' .child', ' ::pseudo') means the matched text is just a
    // prefix of a longer compound selector — skip it.
    const afterSelector = css.substring(start + selector.length);
    const firstNonWs = afterSelector.match(/\S/);
    if (firstNonWs && (firstNonWs[0] === '{' || firstNonWs[0] === ',')) {
      // Find the opening brace after this occurrence.
      const braceOpen = css.indexOf('{', start);
      if (braceOpen === -1) return '';
      const block = extractBraceBlock(css, braceOpen);
      return css.substring(start, braceOpen + block.length);
    }

    // Move past this occurrence and try the next one.
    searchFrom = start + selector.length;
  }
  return '';
}

/**
 * Extract text from `openPos` (must be '{') through its matching '}'.
 * Returns the substring including both braces.
 */
function extractBraceBlock(css: string, openPos: number): string {
  let depth = 0;
  for (let i = openPos; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}') depth--;
    if (depth === 0) return css.substring(openPos, i + 1);
  }
  return '';
}
