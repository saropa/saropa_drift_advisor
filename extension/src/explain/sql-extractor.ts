/**
 * Extract SQL strings from Dart source code for EXPLAIN QUERY PLAN.
 * Pure utility — no VS Code dependency.
 */

const SQL_START_RE = /^\s*(SELECT|WITH)\b/i;

const CUSTOM_CALL_RE =
  /\b(?:customSelect|customStatement)\s*\(\s*(['"])([\s\S]*?)\1/;

/**
 * Extract a SQL query from the user's selection or cursor context.
 *
 * @param documentText  Full text of the Dart file.
 * @param selectedText  The user's selected text (empty string if none).
 * @param cursorLine    Zero-based line number of the cursor.
 * @returns The extracted SQL string, or null if none found.
 */
export function extractSqlFromContext(
  documentText: string,
  selectedText: string,
  cursorLine: number,
): string | null {
  // 1. If the user selected text that looks like SQL, use it directly.
  const trimmed = selectedText.trim();
  if (trimmed.length > 0 && SQL_START_RE.test(trimmed)) {
    return trimmed;
  }

  const lines = documentText.split('\n');
  if (cursorLine < 0 || cursorLine >= lines.length) return null;

  // 2. Try multi-line triple-quoted string around cursor.
  const tripleResult = extractTripleQuoted(lines, cursorLine);
  if (tripleResult && SQL_START_RE.test(tripleResult)) {
    return tripleResult.trim();
  }

  // 3. Try single-line string literal on cursor line.
  const line = lines[cursorLine];
  const singleResult = extractSingleLineString(line);
  if (singleResult) return singleResult;

  // 4. Try customSelect / customStatement call on cursor line.
  const callResult = extractCustomCall(line);
  if (callResult) return callResult;

  return null;
}

/** Extract SQL from a single-line Dart string literal (single or double quotes). */
function extractSingleLineString(line: string): string | null {
  // Match 'SELECT ...' or "SELECT ..."
  const re = /(['"])((?:SELECT|WITH)\b[^'"]*)\1/i;
  const m = re.exec(line);
  if (m) return m[2].trim();
  return null;
}

/** Extract SQL from customSelect('...') or customStatement('...') calls. */
function extractCustomCall(line: string): string | null {
  const m = CUSTOM_CALL_RE.exec(line);
  if (!m) return null;
  const body = m[2].trim();
  return SQL_START_RE.test(body) ? body : null;
}

/**
 * Scan backward/forward from cursorLine to find a triple-quoted string
 * (''' or """) and return its content.
 */
function extractTripleQuoted(
  lines: string[],
  cursorLine: number,
): string | null {
  // Scan backward for opening triple quote
  let openLine = -1;
  let openQuote = '';
  for (let i = cursorLine; i >= 0 && i >= cursorLine - 50; i--) {
    const tripleIdx = findTripleQuote(lines[i]);
    if (tripleIdx !== null) {
      openLine = i;
      openQuote = lines[i].substring(tripleIdx, tripleIdx + 3);
      break;
    }
  }
  if (openLine < 0) return null;

  // Check if both open and close are on the same line (e.g., '''SELECT ...''')
  const openIdx = lines[openLine].indexOf(openQuote);
  const afterOpen = lines[openLine].substring(openIdx + 3);
  const closeOnSame = afterOpen.indexOf(openQuote);
  if (closeOnSame >= 0) {
    return afterOpen.substring(0, closeOnSame);
  }

  // Scan forward for closing triple quote
  const parts: string[] = [afterOpen];
  for (let i = openLine + 1; i < lines.length && i <= openLine + 100; i++) {
    const closeIdx = lines[i].indexOf(openQuote);
    if (closeIdx >= 0) {
      parts.push(lines[i].substring(0, closeIdx));
      return parts.join('\n').trim();
    }
    parts.push(lines[i]);
  }

  return null;
}

/** Find the index of a triple-quote (''' or """) in a line, or null. */
function findTripleQuote(line: string): number | null {
  const s = line.indexOf("'''");
  const d = line.indexOf('"""');
  if (s < 0 && d < 0) return null;
  if (s >= 0 && d >= 0) return Math.min(s, d);
  return s >= 0 ? s : d;
}
