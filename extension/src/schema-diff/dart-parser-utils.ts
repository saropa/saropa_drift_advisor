/**
 * Low-level, general-purpose text parsing utilities used by the Dart/Drift
 * parser. These functions have no domain knowledge of Dart or Drift — they
 * operate purely on string scanning, balanced bracket extraction, and token
 * splitting.
 *
 * Extracted from `dart-parser.ts` to keep each module under 300 lines and
 * separate concerns: this file handles *how* to parse, while `dart-parser.ts`
 * handles *what* to parse.
 */

/**
 * Extract a balanced pair of brackets from `source` starting at `openIndex`.
 *
 * The character at `source[openIndex]` **must** be `openChar` (either `{` or `[`).
 * The scanner tracks nesting depth and skips over:
 *   - line comments (`// …`)
 *   - block comments (`/* … *​/`)
 *   - triple-quoted strings (`'''…'''` and `"""…"""`)
 *   - single-quoted and double-quoted strings (with backslash escaping)
 *
 * @returns An object with `inner` (the text between the brackets, exclusive)
 *          and `endIndex` (the position immediately after the closing bracket),
 *          or `null` if the brackets are never balanced.
 */
export function extractBalanced(
  source: string,
  openIndex: number,
  openChar: '{' | '[',
  closeChar: '}' | ']',
): { inner: string; endIndex: number } | null {
  // Bail out immediately if the character at openIndex isn't what we expect
  if (source[openIndex] !== openChar) return null;

  let depth = 1;
  let i = openIndex + 1;
  const len = source.length;
  const innerStart = i;

  while (i < len) {
    const ch = source[i];

    // --- Skip line comments (`// … \n`) ---
    if (ch === '/' && source[i + 1] === '/') {
      i = source.indexOf('\n', i);
      if (i === -1) break;
      i++;
      continue;
    }

    // --- Skip block comments (`/* … */`) ---
    if (ch === '/' && source[i + 1] === '*') {
      i = source.indexOf('*/', i + 2);
      if (i === -1) break;
      i += 2;
      continue;
    }

    // --- Skip triple-quoted strings (`'''…'''` or `"""…"""`) ---
    if (
      (ch === "'" && source.substring(i, i + 3) === "'''")
      || (ch === '"' && source.substring(i, i + 3) === '"""')
    ) {
      const closer = source.substring(i, i + 3);
      i = source.indexOf(closer, i + 3);
      if (i === -1) break;
      i += 3;
      continue;
    }

    // --- Skip single- and double-quoted strings (with backslash escapes) ---
    if (ch === "'" || ch === '"') {
      i++;
      while (i < len && source[i] !== ch) {
        if (source[i] === '\\') i++; // skip escaped character
        i++;
      }
      i++; // move past the closing quote
      continue;
    }

    // --- Track bracket depth ---
    if (ch === openChar) {
      depth++;
    } else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        // Found the matching close bracket — return the inner content
        return { inner: source.substring(innerStart, i), endIndex: i + 1 };
      }
    }
    i++;
  }

  // Reached end of source without balancing — malformed input
  return null;
}

/**
 * Extract the body of a class by scanning for the matching `}` from the
 * opening brace at `openBraceIndex`.
 *
 * Delegates to {@link extractBalanced} for brace-depth tracking that correctly
 * skips strings and comments. Falls back to returning everything after the
 * opening brace if no balanced closing brace is found (best-effort on
 * malformed input).
 */
export function extractClassBody(
  source: string,
  openBraceIndex: number,
): string {
  const balanced = extractBalanced(source, openBraceIndex, '{', '}');
  if (balanced) return balanced.inner;
  // Fallback: return the rest of the source after the opening brace
  return source.substring(openBraceIndex + 1);
}

/**
 * Locates a getter matching `getterRe` (e.g. `List<Index> get indexes =>`)
 * in `body`, then extracts the inner contents of the immediately following
 * `[ ... ]` list literal (not including the brackets themselves).
 *
 * Handles an optional `const` keyword between the `=>` and the `[`.
 *
 * @returns The inner text of the list literal, or `null` if the getter isn't
 *          found or the list brackets aren't balanced.
 */
export function extractListLiteralAfterGetter(
  body: string,
  getterRe: RegExp,
): string | null {
  const m = body.match(getterRe);
  if (!m || m.index === undefined) return null;

  // Advance past the getter match
  let i = m.index + m[0].length;

  // Skip whitespace between `=>` and the list literal
  while (i < body.length && /\s/.test(body[i])) i++;

  // Skip optional `const` keyword before the list literal
  if (body.startsWith('const', i)) {
    i += 5;
    while (i < body.length && /\s/.test(body[i])) i++;
  }

  // Extract the balanced `[…]` contents
  const balanced = extractBalanced(body, i, '[', ']');
  return balanced ? balanced.inner : null;
}

/**
 * Split the contents of a `columns: [ ... ]` list into Dart identifier tokens.
 *
 * Each comma-separated segment is trimmed and validated against the Dart
 * identifier pattern (`/^[a-zA-Z_]\w*$/`). Non-identifier entries (e.g.
 * method calls, expressions) are silently dropped.
 *
 * @param inner - The text between the `[` and `]` brackets.
 * @returns An array of valid Dart identifier strings.
 */
export function parseColumnRefList(inner: string): string[] {
  const parts = inner.split(',');
  const out: string[] = [];
  for (const p of parts) {
    const t = p.trim();
    // Only include tokens that look like simple Dart identifiers
    if (t && /^[a-zA-Z_]\w*$/.test(t)) out.push(t);
  }
  return out;
}

/**
 * Count newlines before `index` in `source` to derive a 0-based line number.
 *
 * This is a simple linear scan — adequate for the file sizes we encounter
 * in Drift table definitions.
 */
export function lineAt(source: string, index: number): number {
  let count = 0;
  for (let i = 0; i < index; i++) {
    if (source[i] === '\n') count++;
  }
  return count;
}
