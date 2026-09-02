/**
 * Regex-based extraction of Drift table definitions from Dart source.
 * Pure functions — no VS Code dependency.
 *
 * Covers: column getters, optional `tableName` override, `List<Index> get indexes`,
 * and `List<Set<Column>> get uniqueKeys`. Domain-specific parsing logic lives here,
 * while low-level text utilities (balanced bracket extraction, token splitting, etc.)
 * are in `dart-parser-utils.ts`.
 */

import {
  DART_TO_SQL_TYPE,
  IDartColumn,
  IDartIndexDef,
  IDartTable,
} from './dart-schema';
import { TableNameMapper } from '../codelens/table-name-mapper';
import {
  extractBalanced,
  extractClassBody,
  extractListLiteralAfterGetter,
  lineAt,
  parseColumnRefList,
} from './dart-parser-utils';

// Re-export utilities that external consumers import from this module,
// so existing `import { extractClassBody } from './dart-parser'` statements
// continue to work without changes.
export { extractClassBody } from './dart-parser-utils';

// ── Domain-specific regex patterns ──────────────────────────────────────────
// These patterns encode knowledge of Drift/Dart table class syntax and stay
// in this file (not in the generic utils module).

// Dart class-header grammar allows optional `with <mixins>` and
// `implements <interfaces>` clauses between the superclass and the class
// body, in that order, both optional (and Drift's own docs recommend a
// mixin for sharing audit columns like createdAt/updatedAt across tables,
// so the bare `extends Table {` form is not even the common case). The
// previous pattern anchored `Table` directly to `\{`, so any class using a
// mixin or `implements` was invisible to every diagnostic, migration
// generator, and schema diff (bug 006). `\b` after `Table` prevents an
// accidental match on `extends TableCompanion` or similar. `[\s\S]+?` (not
// `.+?`) lets the clause list span a formatter-wrapped line break, e.g.
// `class Foo extends Table\n    with TimestampMixin {`.
const TABLE_CLASS_PATTERN =
  /class\s+(\w+)\s+extends\s+Table\b(?:\s+(?:with|implements)\s+[\s\S]+?)?\s*\{/g;
const COLUMN_PATTERN = /(\w+Column)\s+get\s+(\w+)\s*=>\s*([^;]+);/g;
const TABLE_NAME_RE =
  /String\s+get\s+tableName\s*=>\s*['"](\w+)['"]/;
const NAMED_RE = /\.named\(\s*['"](\w+)['"]\s*\)/;
const NULLABLE_RE = /\.nullable\(\)/;
const AUTO_INCREMENT_RE = /\.autoIncrement\(\)/;
// A column-level default supplied by the schema (constant default or a
// per-insert client default). Either makes a NULL value intentional, so the
// data-quality null-rate rules must not flag the column.
const HAS_DEFAULT_RE = /\.(?:withDefault|clientDefault)\(/;

const INDEX_GETTER_RE = /List<Index>\s+get\s+indexes\s*=>/;
const UNIQUE_KEYS_GETTER_RE = /List<Set<Column>>\s+get\s+uniqueKeys\s*=>/;
const INDEX_CALL_RE =
  /(UniqueIndex|Index)\s*\(\s*['"]([^'"]+)['"]\s*,\s*columns:\s*\[/g;
// Drift's natural/composite primary-key idiom: `Set<Column> get primaryKey
// => {col1, col2};`. Note this is a bare `Set<Column>`, not the
// `List<Set<Column>>` that `uniqueKeys` uses, so it needs its own getter
// pattern and its own `{`-balanced extraction below (bug 010: this getter
// was never parsed at all, so `autoIncrement` was the only primary-key
// signal reaching the migration generator).
const PRIMARY_KEY_GETTER_RE = /Set<Column>\s+get\s+primaryKey\s*=>/;

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

/**
 * Parses a `Set<Column> get primaryKey => {col1, col2};` override — Drift's
 * idiom for a natural or composite primary key (bug 010: this getter used
 * to be invisible to the parser, so `dartColToDef` fell back to treating
 * `autoIncrement` as the only primary-key signal, and any table using this
 * override got a `CREATE TABLE` with no `PRIMARY KEY` clause at all).
 *
 * Returns Dart getter names (not SQL column names) for consistency with
 * `IDartIndexDef.columns` and `uniqueKeys` — callers must resolve them
 * against the table's parsed `columns` list. Returns `undefined` when the
 * getter is absent or its `{...}` body is empty/unbalanced, so callers can
 * tell "no override" apart from "override with zero columns" (impossible in
 * valid Dart, but a malformed source shouldn't be treated as a real key).
 */
function parsePrimaryKeyGetter(body: string): string[] | undefined {
  const m = PRIMARY_KEY_GETTER_RE.exec(body);
  if (!m || m.index === undefined) return undefined;

  // Advance past `=>` to the start of the `{...}` set literal, skipping
  // whitespace the same way extractListLiteralAfterGetter does for `[...]`.
  let i = m.index + m[0].length;
  while (i < body.length && /\s/.test(body[i])) i++;

  const balanced = extractBalanced(body, i, '{', '}');
  if (!balanced) return undefined;

  const cols = parseColumnRefList(balanced.inner);
  return cols.length > 0 ? cols : undefined;
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
    hasDefault: HAS_DEFAULT_RE.test(builderChain),
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

    // Natural/composite primary key override (bug 010) — see
    // parsePrimaryKeyGetter's doc comment for why this is a separate
    // extraction from indexes/uniqueKeys (bare Set<Column>, not List<...>).
    const primaryKey = parsePrimaryKeyGetter(body);

    tables.push({
      dartClassName: className,
      sqlTableName,
      columns,
      indexes,
      uniqueKeys,
      primaryKey,
      fileUri,
      line: lineAt(source, match.index),
    });
  }

  return tables;
}
