/**
 * Regex-based extraction of Drift table definitions from Dart source.
 * Pure functions — no VS Code dependency.
 *
 * Covers: column getters, optional `tableName` override, `List<Index> get indexes`,
 * and `List<Set<Column>> get uniqueKeys`. Balanced `[`/`]` and `{`/`}` scanning
 * skips strings and comments so nested `columns: [ … ]` parses reliably.
 */

import {
  DART_TO_SQL_TYPE,
  IDartColumn,
  IDartIndexDef,
  IDartTable,
} from './dart-schema';
import { TableNameMapper } from '../codelens/table-name-mapper';

const TABLE_CLASS_PATTERN = /class\s+(\w+)\s+extends\s+Table\s*\{/g;
const COLUMN_PATTERN = /(\w+Column)\s+get\s+(\w+)\s*=>\s*([^;]+);/g;
const TABLE_NAME_RE =
  /String\s+get\s+tableName\s*=>\s*['"](\w+)['"]/;
const NAMED_RE = /\.named\(\s*['"](\w+)['"]\s*\)/;
const NULLABLE_RE = /\.nullable\(\)/;
const AUTO_INCREMENT_RE = /\.autoIncrement\(\)/;

const INDEX_GETTER_RE = /List<Index>\s+get\s+indexes\s*=>/;
const UNIQUE_KEYS_GETTER_RE = /List<Set<Column>>\s+get\s+uniqueKeys\s*=>/;
const INDEX_CALL_RE =
  /(UniqueIndex|Index)\s*\(\s*['"]([^'"]+)['"]\s*,\s*columns:\s*\[/g;

/**
 * Extract balanced `[...]` or `{...}` from `openIndex`, which must point at `openChar`.
 * Skips brackets inside strings and comments (same rules as class body extraction).
 */
function extractBalanced(
  source: string,
  openIndex: number,
  openChar: '{' | '[',
  closeChar: '}' | ']',
): { inner: string; endIndex: number } | null {
  if (source[openIndex] !== openChar) return null;
  let depth = 1;
  let i = openIndex + 1;
  const len = source.length;
  const innerStart = i;

  while (i < len) {
    const ch = source[i];

    if (ch === '/' && source[i + 1] === '/') {
      i = source.indexOf('\n', i);
      if (i === -1) break;
      i++;
      continue;
    }

    if (ch === '/' && source[i + 1] === '*') {
      i = source.indexOf('*/', i + 2);
      if (i === -1) break;
      i += 2;
      continue;
    }

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

    if (ch === "'" || ch === '"') {
      i++;
      while (i < len && source[i] !== ch) {
        if (source[i] === '\\') i++;
        i++;
      }
      i++;
      continue;
    }

    if (ch === openChar) {
      depth++;
    } else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        return { inner: source.substring(innerStart, i), endIndex: i + 1 };
      }
    }
    i++;
  }
  return null;
}

/**
 * Extract the body of a class by counting brace depth.
 * Skips braces inside strings and comments.
 */
export function extractClassBody(
  source: string,
  openBraceIndex: number,
): string {
  const balanced = extractBalanced(source, openBraceIndex, '{', '}');
  if (balanced) return balanced.inner;
  return source.substring(openBraceIndex + 1);
}

/**
 * Locates `List<Index> get indexes =>` / `List<Set<Column>> get uniqueKeys =>` and returns
 * the inner contents of the following `[ ... ]` (not including brackets).
 */
function extractListLiteralAfterGetter(
  body: string,
  getterRe: RegExp,
): string | null {
  const m = body.match(getterRe);
  if (!m || m.index === undefined) return null;
  let i = m.index + m[0].length;
  while (i < body.length && /\s/.test(body[i])) i++;
  if (body.startsWith('const', i)) {
    i += 5;
    while (i < body.length && /\s/.test(body[i])) i++;
  }
  const balanced = extractBalanced(body, i, '[', ']');
  return balanced ? balanced.inner : null;
}

/** Split `columns: [ ... ]` contents into Dart identifier tokens. */
function parseColumnRefList(inner: string): string[] {
  const parts = inner.split(',');
  const out: string[] = [];
  for (const p of parts) {
    const t = p.trim();
    if (t && /^[a-zA-Z_]\w*$/.test(t)) out.push(t);
  }
  return out;
}

/**
 * Parses `Index(...)` / `UniqueIndex(...)` entries from the body of `indexes => [ ... ]`.
 */
export function parseDriftIndexCalls(listInner: string): IDartIndexDef[] {
  const result: IDartIndexDef[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(INDEX_CALL_RE.source, INDEX_CALL_RE.flags);
  while ((match = re.exec(listInner)) !== null) {
    const unique = match[1] === 'UniqueIndex';
    const name = match[2];
    const openBracket = match.index + match[0].length - 1;
    const colsBalanced = extractBalanced(listInner, openBracket, '[', ']');
    if (!colsBalanced) continue;
    const columns = parseColumnRefList(colsBalanced.inner);
    result.push({ name, columns, unique });
  }
  return result;
}

/**
 * Parses `{a, b}` sets from the body of `uniqueKeys => [ ... ]`.
 */
export function parseDriftUniqueKeySets(listInner: string): string[][] {
  const sets: string[][] = [];
  const setRe = /\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = setRe.exec(listInner)) !== null) {
    const inner = m[1].trim();
    if (!inner) continue;
    const cols = parseColumnRefList(inner);
    if (cols.length > 0) sets.push(cols);
  }
  return sets;
}

/** Count newlines before `index` in `source` to get a 0-based line number. */
function lineAt(source: string, index: number): number {
  let count = 0;
  for (let i = 0; i < index; i++) {
    if (source[i] === '\n') count++;
  }
  return count;
}

/** Parse a single column getter from its builder chain. */
export function parseColumn(
  dartType: string,
  getterName: string,
  builderChain: string,
  lineOffset: number,
): IDartColumn | null {
  const sqlType = DART_TO_SQL_TYPE[dartType];
  if (!sqlType) return null;

  const namedMatch = NAMED_RE.exec(builderChain);
  const sqlName = namedMatch
    ? namedMatch[1]
    : TableNameMapper.dartClassToSnakeCase(getterName);

  return {
    dartName: getterName,
    sqlName,
    dartType,
    sqlType,
    nullable: NULLABLE_RE.test(builderChain),
    autoIncrement: AUTO_INCREMENT_RE.test(builderChain),
    line: lineOffset,
  };
}

/**
 * Returns true when the character at `index` falls inside a comment:
 * doc comments (`///`), line comments (`//`), or block comments (`/* … *​/`).
 *
 * Checks the line prefix first (fast path for `///`, `//`, and `*`-prefixed
 * block comment body lines), then scans backwards for an unmatched `/*` opener.
 *
 * Note: does NOT detect matches inside string literals — that would require
 * full lexer state tracking. In practice this is fine because real Drift table
 * classes are never defined inside strings.
 */
export function isInsideComment(source: string, index: number): boolean {
  // Find the start of the line containing the match
  const lineStart = source.lastIndexOf('\n', index - 1) + 1;
  const prefix = source.substring(lineStart, index).trimStart();

  // Doc comments (///), regular line comments (//)
  if (prefix.startsWith('///') || prefix.startsWith('//')) {
    return true;
  }

  // Check if inside a block comment by scanning backwards for an unmatched /*
  // Start from just before the match and look for /* without a closing */
  let i = index - 1;
  while (i >= 0) {
    if (i > 0 && source[i - 1] === '*' && source[i] === '/') {
      // Found a */ closer before us — we're not in a block comment
      break;
    }
    if (i > 0 && source[i - 1] === '/' && source[i] === '*') {
      // Found a /* opener before us with no closer — we're in a block comment
      return true;
    }
    i--;
  }

  // Also check for lines that start with `*` (common in block comment bodies)
  if (prefix.startsWith('*')) {
    return true;
  }

  return false;
}

/**
 * Parse all Drift table classes from a Dart source string.
 * `fileUri` is attached to each result for source navigation.
 */
export function parseDartTables(
  source: string,
  fileUri: string,
): IDartTable[] {
  const tables: IDartTable[] = [];
  let match: RegExpExecArray | null;
  // Fresh regex per call to avoid lastIndex persistence from the global pattern
  const tableRe = new RegExp(TABLE_CLASS_PATTERN.source, TABLE_CLASS_PATTERN.flags);

  while ((match = tableRe.exec(source)) !== null) {
    // Skip matches inside comments (doc comments, line comments, block comments)
    // to avoid false positives from DartDoc code examples
    if (isInsideComment(source, match.index)) {
      continue;
    }

    const className = match[1];
    const openBrace = match.index + match[0].length - 1;
    const body = extractClassBody(source, openBrace);

    // Table name: override or PascalCase→snake_case
    const nameMatch = TABLE_NAME_RE.exec(body);
    const sqlTableName = nameMatch
      ? nameMatch[1]
      : TableNameMapper.dartClassToSnakeCase(className);

    // Columns
    const columns: IDartColumn[] = [];
    let colMatch: RegExpExecArray | null;
    const colRe = new RegExp(COLUMN_PATTERN.source, COLUMN_PATTERN.flags);
    while ((colMatch = colRe.exec(body)) !== null) {
      const col = parseColumn(
        colMatch[1],
        colMatch[2],
        colMatch[3],
        lineAt(source, openBrace + 1 + colMatch.index),
      );
      if (col) columns.push(col);
    }

    const indexesInner = extractListLiteralAfterGetter(body, INDEX_GETTER_RE);
    const indexes = indexesInner ? parseDriftIndexCalls(indexesInner) : [];

    const uniqueInner = extractListLiteralAfterGetter(body, UNIQUE_KEYS_GETTER_RE);
    const uniqueKeys = uniqueInner ? parseDriftUniqueKeySets(uniqueInner) : [];

    tables.push({
      dartClassName: className,
      sqlTableName,
      columns,
      indexes,
      uniqueKeys,
      fileUri,
      line: lineAt(source, match.index),
    });
  }

  return tables;
}
