/**
 * SELECT-list, WHERE, GROUP BY, and ORDER BY parsing for the shared SQL importer
 * (Feature 21, Phase 1). These clause parsers only read/append to a [CoreModel]
 * (they never create table instances), so they are model-shape-agnostic and used
 * unchanged by both the extension and web importers. FROM/JOIN parsing — which
 * does create instances — lives in [query-builder-core-import] behind a table
 * factory.
 */
import type { CoreModel, CoreFilter } from './query-builder-core';
import {
  makeImportId,
  parseQualified,
  parseScalarLiteral,
  qualFromQMatch,
  splitCsvRespectingParensAndStrings,
} from './query-builder-core-parse';

export function parseSelectList(
  selectList: string,
  model: CoreModel,
  aliasToInstanceId: Map<string, string>,
  warnings: string[],
  errors: string[],
): void {
  // `*` means "all columns": leave selectedColumns empty so the renderer emits `*`.
  if (/^\*\s*$/i.test(selectList) || selectList === '*') return;
  const parts = splitCsvRespectingParensAndStrings(selectList);
  const aggRe =
    /^(SUM|COUNT|AVG|MIN|MAX)\s*\(\s*("(?:[^"]|"")+"|(\w+))\s*\.\s*("(?:[^"]|"")+"|(\w+))\s*\)(?:\s+AS\s+("(?:[^"]|"")+"|(\w+)))?/i;
  for (const part of parts) {
    const p = part.trim();
    if (!p) continue;
    const am = p.match(aggRe);
    if (am) {
      const fn = am[1]!.toUpperCase();
      const aAlias = am[2]!.startsWith('"') ? am[2]!.replace(/^"|"$/g, '').replace(/""/g, '"') : am[3]!;
      const aCol = am[4]!.startsWith('"') ? am[4]!.replace(/^"|"$/g, '').replace(/""/g, '"') : am[5]!;
      const outAlias = am[6]
        ? am[6].startsWith('"')
          ? am[6].replace(/^"|"$/g, '').replace(/""/g, '"')
          : am[7]
        : undefined;
      const tid = aliasToInstanceId.get(aAlias);
      if (!tid) {
        errors.push(`Unknown alias in aggregate: ${aAlias}`);
        return;
      }
      model.selectedColumns.push({ tableId: tid, column: aCol, aggregation: fn, alias: outAlias });
      continue;
    }
    const qc = parseQualified(p);
    if (qc) {
      const tid = aliasToInstanceId.get(qc.alias);
      if (!tid) {
        errors.push(`Unknown alias in SELECT: ${qc.alias}`);
        return;
      }
      model.selectedColumns.push({ tableId: tid, column: qc.col });
      continue;
    }
    warnings.push(`Skipped SELECT expression: ${p.slice(0, 80)}`);
  }
}

interface WhereChunk {
  expr: string;
  join?: 'AND' | 'OR';
}

/**
 * Split WHERE into predicates; each item after the first has [join] meaning how
 * it attaches to the previous predicate (AND/OR). Paren/string aware.
 */
function splitWhereManual(s: string): WhereChunk[] {
  const result: WhereChunk[] = [];
  let depth = 0;
  let inStr: '"' | "'" | null = null;
  let buf = '';
  let pendingJoin: 'AND' | 'OR' = 'AND';
  const flush = () => {
    const t = buf.trim();
    if (!t) {
      buf = '';
      return;
    }
    if (result.length === 0) result.push({ expr: t });
    else result.push({ expr: t, join: pendingJoin });
    buf = '';
  };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (inStr) {
      buf += ch;
      if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = ch as '"' | "'";
      buf += ch;
      continue;
    }
    if (ch === '(') {
      depth++;
      buf += ch;
      continue;
    }
    if (ch === ')') {
      depth = Math.max(0, depth - 1);
      buf += ch;
      continue;
    }
    if (depth === 0) {
      const tail = s.slice(i);
      const mAnd = tail.match(/^\s+AND\s+/i);
      if (mAnd) {
        flush();
        pendingJoin = 'AND';
        i += mAnd[0].length - 1;
        continue;
      }
      const mOr = tail.match(/^\s+OR\s+/i);
      if (mOr) {
        flush();
        pendingJoin = 'OR';
        i += mOr[0].length - 1;
        continue;
      }
    }
    buf += ch;
  }
  flush();
  return result;
}

function parseWherePredicate(
  expr: string,
  aliasToInstanceId: Map<string, string>,
  errors: string[],
): CoreFilter | null {
  const e = expr.replace(/\s+/g, ' ').trim();
  const q = `("(?:[^"]|"")+"|(\\w+))\\.("(?:[^"]|"")+"|(\\w+))`;
  const isNull = new RegExp(`^${q}\\s+IS\\s+NULL\\s*$`, 'i');
  const isNotNull = new RegExp(`^${q}\\s+IS\\s+NOT\\s+NULL\\s*$`, 'i');
  const like = new RegExp(`^${q}\\s+LIKE\\s+('(?:[^']|'')*')\\s*$`, 'i');
  const inn = new RegExp(`^${q}\\s+IN\\s*\\(([^)]+)\\)\\s*$`, 'i');
  const cmp = new RegExp(`^${q}\\s*(=|!=|<>|<=|>=|<|>)\\s*(.+)$`, 'i');

  const bind = (m: RegExpMatchArray): { tid: string; col: string } | null => {
    const ac = qualFromQMatch(m);
    const tid = aliasToInstanceId.get(ac.alias);
    if (!tid) {
      errors.push(`Unknown alias in WHERE: ${ac.alias}`);
      return null;
    }
    return { tid, col: ac.col };
  };

  let m = e.match(isNull);
  if (m) {
    const b = bind(m);
    if (!b) return null;
    return { id: makeImportId('flt'), tableId: b.tid, column: b.col, operator: 'IS NULL', conjunction: 'AND' };
  }
  m = e.match(isNotNull);
  if (m) {
    const b = bind(m);
    if (!b) return null;
    return { id: makeImportId('flt'), tableId: b.tid, column: b.col, operator: 'IS NOT NULL', conjunction: 'AND' };
  }
  m = e.match(like);
  if (m) {
    const b = bind(m);
    if (!b) return null;
    const lit = m[5]!;
    const val = lit.slice(1, -1).replace(/''/g, "'");
    return { id: makeImportId('flt'), tableId: b.tid, column: b.col, operator: 'LIKE', value: val, conjunction: 'AND' };
  }
  m = e.match(inn);
  if (m) {
    const b = bind(m);
    if (!b) return null;
    const inner = m[5]!;
    const values = splitCsvRespectingParensAndStrings(inner).map((x) => parseScalarLiteral(x.trim()));
    return { id: makeImportId('flt'), tableId: b.tid, column: b.col, operator: 'IN', values, conjunction: 'AND' };
  }
  m = e.match(cmp);
  if (m) {
    const b = bind(m);
    if (!b) return null;
    let op = m[5] as string;
    if (op === '<>') op = '!=';
    if (!['=', '!=', '<', '>', '<=', '>='].includes(op)) return null;
    const val = parseScalarLiteral(m[6]!.trim());
    return { id: makeImportId('flt'), tableId: b.tid, column: b.col, operator: op, value: val, conjunction: 'AND' };
  }
  return null;
}

export function parseWhere(
  whereSql: string,
  model: CoreModel,
  aliasToInstanceId: Map<string, string>,
  warnings: string[],
  errors: string[],
): void {
  const chunks = splitWhereManual(whereSql);
  if (chunks.some((c) => c.join === 'OR')) {
    warnings.push('WHERE used OR — verify intent; filters are a flat AND/OR chain in the builder');
  }
  for (const chunk of chunks) {
    const filter = parseWherePredicate(chunk.expr, aliasToInstanceId, errors);
    if (!filter) {
      errors.push(`Unsupported WHERE predicate: ${chunk.expr}`);
      return;
    }
    filter.conjunction = chunk.join ?? 'AND';
    model.filters.push(filter);
  }
}

export function parseGroupBy(
  groupSql: string,
  model: CoreModel,
  aliasToInstanceId: Map<string, string>,
  errors: string[],
): void {
  for (const part of splitCsvRespectingParensAndStrings(groupSql)) {
    const qc = parseQualified(part.trim());
    if (!qc) {
      errors.push(`GROUP BY column not understood: ${part}`);
      return;
    }
    const tid = aliasToInstanceId.get(qc.alias);
    if (!tid) {
      errors.push(`Unknown alias in GROUP BY: ${qc.alias}`);
      return;
    }
    model.groupBy.push({ tableId: tid, column: qc.col });
  }
}

export function parseOrderBy(
  orderSql: string,
  model: CoreModel,
  aliasToInstanceId: Map<string, string>,
  errors: string[],
): void {
  for (const part of splitCsvRespectingParensAndStrings(orderSql)) {
    const p = part.trim().replace(/\s+/g, ' ');
    const m = p.match(/^("(?:[^"]|"")+"|(\w+))\.("(?:[^"]|"")+"|(\w+))(?:\s+(ASC|DESC))?$/i);
    if (!m) {
      errors.push(`ORDER BY column not understood: ${p}`);
      return;
    }
    const alias = m[1]!.startsWith('"') ? m[1]!.replace(/^"|"$/g, '').replace(/""/g, '"') : m[2]!;
    const col = m[3]!.startsWith('"') ? m[3]!.replace(/^"|"$/g, '').replace(/""/g, '"') : m[4]!;
    const dir = (m[5]?.toUpperCase() ?? 'ASC') === 'DESC' ? 'DESC' : 'ASC';
    const tid = aliasToInstanceId.get(alias);
    if (!tid) {
      errors.push(`Unknown alias in ORDER BY: ${alias}`);
      return;
    }
    model.orderBy.push({ tableId: tid, column: col, direction: dir });
  }
}
