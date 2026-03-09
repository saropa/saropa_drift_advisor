/**
 * Regex-based extraction of Drift table definitions from Dart source.
 * Pure functions — no VS Code dependency.
 */

import { DART_TO_SQL_TYPE, IDartColumn, IDartTable } from './dart-schema';
import { TableNameMapper } from '../codelens/table-name-mapper';

const TABLE_CLASS_PATTERN = /class\s+(\w+)\s+extends\s+Table\s*\{/g;
const COLUMN_PATTERN = /(\w+Column)\s+get\s+(\w+)\s*=>\s*([^;]+);/g;
const TABLE_NAME_RE =
  /String\s+get\s+tableName\s*=>\s*['"](\w+)['"]/;
const NAMED_RE = /\.named\(\s*['"](\w+)['"]\s*\)/;
const NULLABLE_RE = /\.nullable\(\)/;
const AUTO_INCREMENT_RE = /\.autoIncrement\(\)/;

/**
 * Extract the body of a class by counting brace depth.
 * Skips braces inside strings and comments.
 */
export function extractClassBody(
  source: string,
  openBraceIndex: number,
): string {
  let depth = 0;
  let i = openBraceIndex;
  const len = source.length;

  while (i < len) {
    const ch = source[i];

    // Line comment — skip to end of line
    if (ch === '/' && source[i + 1] === '/') {
      i = source.indexOf('\n', i);
      if (i === -1) break;
      i++;
      continue;
    }

    // Block comment — skip to */
    if (ch === '/' && source[i + 1] === '*') {
      i = source.indexOf('*/', i + 2);
      if (i === -1) break;
      i += 2;
      continue;
    }

    // Triple-quoted strings
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

    // Single/double quoted strings
    if (ch === "'" || ch === '"') {
      i++;
      while (i < len && source[i] !== ch) {
        if (source[i] === '\\') i++; // skip escaped char
        i++;
      }
      i++; // skip closing quote
      continue;
    }

    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return source.substring(openBraceIndex + 1, i);
      }
    }
    i++;
  }
  return source.substring(openBraceIndex + 1);
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

    tables.push({
      dartClassName: className,
      sqlTableName,
      columns,
      fileUri,
      line: lineAt(source, match.index),
    });
  }

  return tables;
}
