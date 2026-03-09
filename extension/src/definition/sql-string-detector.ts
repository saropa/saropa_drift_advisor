/**
 * Pure utility functions for detecting SQL strings in Dart code
 * and classifying identifiers as table or column names.
 * No VS Code dependency — easy to unit test.
 */

const SQL_KEYWORDS_RE =
  /\b(SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|JOIN|CREATE|ALTER|INTO|SET|VALUES|ORDER|GROUP|HAVING|LIMIT|OFFSET)\b/i;

/**
 * Check whether a character position falls inside a string literal.
 * Handles single and double quotes with backslash escaping.
 */
export function isInsideString(lineText: string, charPos: number): boolean {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < charPos && i < lineText.length; i++) {
    const ch = lineText[i];
    if (ch === '\\') {
      i++; // skip escaped character
      continue;
    }
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    if (ch === '"' && !inSingle) inDouble = !inDouble;
  }
  return inSingle || inDouble;
}

/**
 * Extract the content of the string literal surrounding the given position.
 * Returns null if the position is not inside a string.
 */
export function extractEnclosingString(
  lineText: string,
  charPos: number,
): string | null {
  let i = 0;
  while (i < lineText.length) {
    const ch = lineText[i];
    if (ch === "'" || ch === '"') {
      const quote = ch;
      const contentStart = i + 1;
      i++;
      while (i < lineText.length) {
        if (lineText[i] === '\\') {
          i += 2;
          continue;
        }
        if (lineText[i] === quote) break;
        i++;
      }
      const contentEnd = i;
      if (charPos >= contentStart && charPos <= contentEnd) {
        return lineText.substring(contentStart, contentEnd);
      }
      i++; // skip closing quote
    } else {
      i++;
    }
  }
  return null;
}

/**
 * Check if text contains SQL keywords.
 */
export function containsSqlKeywords(text: string): boolean {
  return SQL_KEYWORDS_RE.test(text);
}

/**
 * Check if a cursor position is inside a SQL string literal.
 */
export function isInsideSqlString(lineText: string, charPos: number): boolean {
  if (!isInsideString(lineText, charPos)) return false;
  const str = extractEnclosingString(lineText, charPos);
  if (!str) return false;
  return containsSqlKeywords(str);
}

/**
 * Get the word (SQL identifier) at the given character position.
 */
export function getWordAt(
  lineText: string,
  charPos: number,
): { word: string; start: number; end: number } | null {
  if (charPos < 0 || charPos >= lineText.length) return null;
  if (!/\w/.test(lineText[charPos])) return null;

  let start = charPos;
  while (start > 0 && /\w/.test(lineText[start - 1])) start--;

  let end = charPos;
  while (end < lineText.length - 1 && /\w/.test(lineText[end + 1])) end++;

  return { word: lineText.substring(start, end + 1), start, end: end + 1 };
}

export interface IdentifierClassification {
  type: 'table' | 'column';
  tableName?: string;
}

/**
 * Classify a word as a table name, column name, or neither,
 * using known schema metadata.
 */
export function classifyIdentifier(
  word: string,
  sqlContext: string,
  knownTables: string[],
  knownColumns: Map<string, string[]>,
): IdentifierClassification | null {
  const lower = word.toLowerCase();

  // Check if it's a known table name
  if (knownTables.some((t) => t.toLowerCase() === lower)) {
    return { type: 'table' };
  }

  // Check if it's a known column — prefer a table referenced in the SQL context
  let fallbackTable: string | undefined;
  for (const [table, columns] of knownColumns) {
    if (columns.some((c) => c.toLowerCase() === lower)) {
      if (sqlContext.toLowerCase().includes(table.toLowerCase())) {
        return { type: 'column', tableName: table };
      }
      if (!fallbackTable) fallbackTable = table;
    }
  }

  // Return first match even if table isn't in context
  if (fallbackTable) {
    return { type: 'column', tableName: fallbackTable };
  }

  return null;
}
