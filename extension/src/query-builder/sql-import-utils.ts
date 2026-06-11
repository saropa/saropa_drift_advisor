/**
 * Shared low-level helpers for the SQL → query-model importer: comment
 * stripping, top-level clause boundary detection, identifier unquoting,
 * qualified-name parsing, scalar-literal coercion, and paren/string-aware CSV
 * splitting. These are pure string utilities with no dependency on the query
 * model, so every clause parser ([sql-import-from-joins], [sql-import-where],
 * etc.) can import them without forming an import cycle.
 */

export function stripSqlComments(input: string): string {
  let s = input.replace(/\/\*[\s\S]*?\*\//g, ' ');
  s = s
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('--');
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join('\n');
  return s.trim();
}

/** Start indices of top-level clauses after FROM (or -1 if absent). */
export interface IClausePositions {
  where: number;
  groupBy: number;
  orderBy: number;
  limit: number;
  /** Minimum of present clause starts, or EOF when no clause follows FROM. */
  firstClauseStart: number;
}

export function clausePositions(afterFrom: string): IClausePositions {
  const len = afterFrom.length;
  const w = indexOfKeyword(afterFrom, 'WHERE');
  const g = indexOfKeyword(afterFrom, 'GROUP BY');
  const o = indexOfKeyword(afterFrom, 'ORDER BY');
  const l = indexOfKeyword(afterFrom, 'LIMIT');
  const starts = [w, g, o, l].filter((x) => x >= 0);
  const firstClauseStart = starts.length ? Math.min(...starts) : len;
  return { where: w, groupBy: g, orderBy: o, limit: l, firstClauseStart };
}

/**
 * End index (exclusive) for the clause beginning at [start], i.e. before the
 * next WHERE/GROUP BY/ORDER BY/LIMIT that appears strictly after [start].
 */
export function nextClauseEnd(
  afterFrom: string,
  start: number,
  c: IClausePositions,
): number {
  const len = afterFrom.length;
  const next = [c.groupBy, c.orderBy, c.limit].filter((x) => x >= 0 && x > start);
  return next.length ? Math.min(...next) : len;
}

export function indexOfKeyword(haystack: string, keyword: string): number {
  const re =
    keyword === 'GROUP BY'
      ? /\bGROUP\s+BY\b/i
      : keyword === 'ORDER BY'
        ? /\bORDER\s+BY\b/i
        : new RegExp(`\\b${keyword}\\b`, 'i');
  const m = re.exec(haystack);
  return m ? m.index : -1;
}

export function unquoteIdent(tok: string): string {
  if (tok.startsWith('"')) {
    return tok.replace(/^"|"$/g, '').replace(/""/g, '"');
  }
  return tok;
}

/** `"a".b` or `a.b` → { alias, col } */
export function parseQualified(expr: string): { alias: string; col: string } | null {
  const m = expr
    .replace(/\s+/g, ' ')
    .trim()
    .match(/^("(?:[^"]|"")+"|(\w+))\.("(?:[^"]|"")+"|(\w+))$/);
  if (!m) return null;
  const alias = m[1].startsWith('"') ? unquoteIdent(m[1]) : m[2]!;
  const col = m[3].startsWith('"') ? unquoteIdent(m[3]) : m[4]!;
  return { alias, col };
}

/** First two qualified-name capture groups from [q] regex match. */
export function qualFromQMatch(m: RegExpMatchArray): { alias: string; col: string } {
  const alias = m[1]!.startsWith('"') ? unquoteIdent(m[1]!) : m[2]!;
  const col = m[3]!.startsWith('"') ? unquoteIdent(m[3]!) : m[4]!;
  return { alias, col };
}

export function parseScalarLiteral(rhs: string): string | number | boolean {
  const t = rhs.trim();
  if (/^'/.test(t)) {
    return t.slice(1, -1).replace(/''/g, "'");
  }
  if (/^"/.test(t)) {
    return t.slice(1, -1).replace(/""/g, '"');
  }
  if (/^(true|false)$/i.test(t)) return t.toLowerCase() === 'true';
  const n = Number(t);
  if (Number.isFinite(n) && t !== '') return n;
  return t;
}

/** Split on commas outside parentheses and string literals. */
export function splitCsvRespectingParensAndStrings(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  let inStr: '"' | "'" | null = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (inStr) {
      if (ch === inStr) {
        inStr = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch as '"' | "'";
      continue;
    }
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
}
