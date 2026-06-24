/**
 * Lightweight parser that pulls column references out of the raw SQL strings
 * passed to Drift's `customSelect(...)` / `customStatement(...)`.
 *
 * Drift's typed query builder is schema-checked, but a raw SQL string is opaque
 * to the compiler: a column typo only surfaces as a runtime
 * `SqliteException(1): no such column`. This parser extracts every bare column
 * identifier that resolves to a single, named table so the checker can validate
 * it against the profiled schema BEFORE it ships.
 *
 * Pure (no VS Code dependency) so it is fully unit-testable. It is deliberately
 * conservative — a missed column is a false negative (safe), a wrongly-flagged
 * valid column is a false positive (noise). When in doubt it skips:
 *   - Any query that is not against exactly ONE table (JOINs, comma FROM,
 *     subqueries with their own FROM) is skipped entirely — a bare column in a
 *     multi-table query cannot be attributed to one table without full scope
 *     analysis.
 *   - Function names, aliases (after `AS`), `*`, literals, bind params, and
 *     identifiers in non-column positions are never treated as columns.
 *   - A qualified `x.col` is validated only when `x` is the table name or its
 *     alias; an unknown qualifier is skipped.
 *
 * The lexer (literal/comment masking + tokenizer) lives in raw-sql-tokenizer to
 * keep both files under the line cap.
 */

import type { IToken } from './raw-sql-tokenizer';
import { blankLiteralsAndComments, tokenize } from './raw-sql-tokenizer';

/** A column identifier extracted from a raw SQL string, with its source span. */
export interface IRawSqlColumnRef {
  /** Table the reference resolves to (last dotted segment, lowercased). */
  table: string;
  /** Bare column identifier as written in the SQL (last dotted segment). */
  column: string;
  /** Absolute character offset of the column token in the document text. */
  offset: number;
  /** Length of the column token (the segment validated). */
  length: number;
}

/**
 * Matches a `customSelect`/`customStatement` call and captures the string body.
 * Global + non-greedy so a whole file is scanned, not just the cursor line.
 * Handles single, double, and triple quotes plus an optional Dart raw-string
 * `r` prefix. The body is captured lazily up to the matching closing quote.
 */
const CUSTOM_CALL_RE =
  /\b(?:customSelect|customStatement)\s*\(\s*[rR]?('''|"""|['"])([\s\S]*?)\1/g;

/**
 * Reserved words that, when they directly precede an identifier, place that
 * identifier in a column position (a column may legally follow them). Used as a
 * positive filter: only identifiers in a recognized column position are
 * validated, which avoids flagging table names, aliases, and keywords.
 */
const COLUMN_INTRODUCERS = new Set([
  'select',
  'distinct',
  'all',
  'where',
  'on',
  'and',
  'or',
  'not',
  'by',
  'having',
  'between',
  'like',
  'in',
  'set',
]);

/**
 * Reserved words that introduce a TABLE position (the following identifier is a
 * table name, not a column) or an alias — never validated as a column.
 */
const SQL_KEYWORDS = new Set([
  'select', 'distinct', 'all', 'from', 'where', 'group', 'order', 'by',
  'having', 'limit', 'offset', 'join', 'inner', 'left', 'right', 'outer',
  'cross', 'full', 'natural', 'on', 'using', 'as', 'and', 'or', 'not', 'in',
  'between', 'like', 'is', 'null', 'asc', 'desc', 'union', 'intersect',
  'except', 'insert', 'into', 'values', 'update', 'set', 'delete', 'create',
  'table', 'index', 'drop', 'alter', 'pragma', 'with', 'recursive', 'case',
  'when', 'then', 'else', 'end', 'exists', 'cast', 'collate', 'returning',
  'true', 'false', 'glob', 'regexp', 'escape', 'window', 'over', 'partition',
]);

/** Clause keywords that terminate the FROM table list. */
const FROM_TERMINATORS = new Set([
  'where', 'group', 'order', 'limit', 'having', 'union', 'intersect',
  'except', 'on', 'using', 'window', 'returning',
]);

/** Last segment of a possibly-dotted identifier (`a.b.c` -> `c`). */
function lastSegment(text: string): string {
  const dot = text.lastIndexOf('.');
  return dot < 0 ? text : text.slice(dot + 1);
}

interface ITableInfo {
  /** Resolved single table name (last dotted segment, lowercased). */
  table: string;
  /** Alias declared in the FROM clause, lowercased, or null. */
  alias: string | null;
}

/**
 * Resolve the single source table of a query, or null when it is not a
 * single-table query (no FROM, multiple tables, or any JOIN) and must be
 * skipped. Only the FIRST FROM is considered; a second FROM (subquery) marks
 * the query as multi-table and is skipped.
 */
function resolveSingleTable(tokens: IToken[]): ITableInfo | null {
  // Any JOIN makes this multi-table.
  const fromIndices: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i].kind === 'word' ? tokens[i].text.toLowerCase() : '';
    if (w === 'join') return null;
    if (w === 'from') fromIndices.push(i);
  }
  if (fromIndices.length !== 1) return null;

  const fromIdx = fromIndices[0];
  // First word after FROM is the table.
  let i = fromIdx + 1;
  while (i < tokens.length && tokens[i].kind !== 'word') i++;
  if (i >= tokens.length) return null;
  const tableToken = tokens[i];
  if (SQL_KEYWORDS.has(tableToken.text.toLowerCase())) return null;
  const table = lastSegment(tableToken.text).toLowerCase();

  // Optional alias: `FROM t alias` or `FROM t AS alias`.
  let alias: string | null = null;
  let j = i + 1;
  if (j < tokens.length && tokens[j].kind === 'word') {
    let candidate = tokens[j];
    if (candidate.text.toLowerCase() === 'as') {
      j++;
      candidate = j < tokens.length ? tokens[j] : candidate;
    }
    const lower = candidate.kind === 'word' ? candidate.text.toLowerCase() : '';
    if (
      candidate.kind === 'word' &&
      lower !== 'as' &&
      !SQL_KEYWORDS.has(lower)
    ) {
      alias = lower;
      j++;
    }
  }

  // Detect a comma-separated second table before the FROM clause terminates.
  for (let k = j; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.kind === 'word' && FROM_TERMINATORS.has(t.text.toLowerCase())) break;
    if (t.kind === 'comma') return null;
  }

  return { table, alias };
}

/**
 * Decide whether the word at `tokens[idx]` is a column reference to validate,
 * and if so return its column name and the absolute span of the validated
 * segment. Returns null for keywords, function names, aliases, and identifiers
 * that are not in a column position.
 */
function columnAt(
  tokens: IToken[],
  idx: number,
  bodyOffset: number,
  info: ITableInfo,
): IRawSqlColumnRef | null {
  const tok = tokens[idx];
  if (tok.kind !== 'word') return null;

  // A word immediately followed by `(` is a function name, not a column.
  const next = tokens[idx + 1];
  if (next && next.kind === 'lparen') return null;

  // A column appears only after an introducer keyword, a comma, an opening
  // paren (function arg / grouped predicate), or an operator. Anything else
  // (table position after FROM/JOIN, alias after AS, implicit alias after a
  // word or `)`) is not validated.
  const prev = tokens[idx - 1];
  if (!prev) return null;
  const prevIsColumnPosition =
    prev.kind === 'comma' ||
    prev.kind === 'lparen' ||
    prev.kind === 'op' ||
    (prev.kind === 'word' && COLUMN_INTRODUCERS.has(prev.text.toLowerCase()));
  if (!prevIsColumnPosition) return null;

  const dot = tok.text.lastIndexOf('.');
  const column = dot < 0 ? tok.text : tok.text.slice(dot + 1);
  const columnLower = column.toLowerCase();

  // Skip keywords sitting in a column slot (e.g. NULL, TRUE, CASE).
  if (SQL_KEYWORDS.has(columnLower)) return null;
  // Skip the table name referenced bare (unusual, and not a column).
  if (columnLower === info.table) return null;

  // Qualified `x.col`: only validate when x is the table or its alias.
  if (dot >= 0) {
    const qualifier = tok.text.slice(0, dot).toLowerCase();
    const qualLast = lastSegment(qualifier);
    if (qualLast !== info.table && qualifier !== info.alias) return null;
  }

  const segOffset = bodyOffset + tok.offset + (tok.text.length - column.length);
  return {
    table: info.table,
    column,
    offset: segOffset,
    length: column.length,
  };
}

/**
 * Extract every validatable column reference from the `customSelect` /
 * `customStatement` raw SQL strings in a Dart source file. Offsets are absolute
 * in `documentText` so the caller can map them to editor ranges.
 */
export function extractRawSqlColumnRefs(
  documentText: string,
): IRawSqlColumnRef[] {
  const refs: IRawSqlColumnRef[] = [];
  CUSTOM_CALL_RE.lastIndex = 0;
  let call: RegExpExecArray | null;
  while ((call = CUSTOM_CALL_RE.exec(documentText)) !== null) {
    const body = call[2];
    if (!body) continue;
    // The body sits immediately before the closing quote at the end of match.
    const bodyOffset = call.index + call[0].lastIndexOf(body);

    const cleaned = blankLiteralsAndComments(body);
    const tokens = tokenize(cleaned);

    const info = resolveSingleTable(tokens);
    if (!info) continue;

    for (let i = 0; i < tokens.length; i++) {
      const ref = columnAt(tokens, i, bodyOffset, info);
      if (ref) refs.push(ref);
    }
  }
  return refs;
}
