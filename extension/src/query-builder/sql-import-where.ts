/**
 * WHERE-clause parsing for the SQL importer. Splits a top-level predicate chain
 * (paren/string aware) into a flat AND/OR list and maps each predicate to an
 * [IQueryFilter]: IS [NOT] NULL, LIKE, IN, and comparison operators.
 */
import {
  makeId,
  type IQueryFilter,
  type IQueryModel,
} from './query-model';
import {
  parseScalarLiteral,
  qualFromQMatch,
  splitCsvRespectingParensAndStrings,
} from './sql-import-utils';

export function parseWhere(
  whereSql: string,
  model: IQueryModel,
  aliasToInstanceId: Map<string, string>,
  warnings: string[],
  errors: string[],
): void {
  const chunks = splitWhereManual(whereSql);
  if (chunks.some((c) => c.join === 'OR')) {
    warnings.push('WHERE used OR — verify intent; filters are a flat AND/OR chain in the builder');
  }
  for (let i = 0; i < chunks.length; i++) {
    const filter = parseWherePredicate(chunks[i]!.expr, aliasToInstanceId, errors);
    if (!filter) {
      errors.push(`Unsupported WHERE predicate: ${chunks[i]!.expr}`);
      return;
    }
    filter.conjunction = chunks[i]!.join ?? 'AND';
    model.filters.push(filter);
  }
}

/**
 * Split WHERE into predicates; each item after the first has [join] meaning how
 * it attaches to the previous predicate (AND/OR).
 */
function splitWhereManual(s: string): Array<{ expr: string; join?: 'AND' | 'OR' }> {
  const result: Array<{ expr: string; join?: 'AND' | 'OR' }> = [];
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
    if (result.length === 0) {
      result.push({ expr: t });
    } else {
      result.push({ expr: t, join: pendingJoin });
    }
    buf = '';
  };
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (inStr) {
      buf += ch;
      if (ch === inStr) {
        inStr = null;
      }
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
): IQueryFilter | null {
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
    return { id: makeId('flt'), tableId: b.tid, column: b.col, operator: 'IS NULL', conjunction: 'AND' };
  }
  m = e.match(isNotNull);
  if (m) {
    const b = bind(m);
    if (!b) return null;
    return { id: makeId('flt'), tableId: b.tid, column: b.col, operator: 'IS NOT NULL', conjunction: 'AND' };
  }
  m = e.match(like);
  if (m) {
    const b = bind(m);
    if (!b) return null;
    const lit = m[5]!;
    const val = lit.slice(1, -1).replace(/''/g, "'");
    return { id: makeId('flt'), tableId: b.tid, column: b.col, operator: 'LIKE', value: val, conjunction: 'AND' };
  }
  m = e.match(inn);
  if (m) {
    const b = bind(m);
    if (!b) return null;
    const inner = m[5]!;
    const values = splitCsvRespectingParensAndStrings(inner).map((x) => parseScalarLiteral(x.trim()));
    return { id: makeId('flt'), tableId: b.tid, column: b.col, operator: 'IN', values, conjunction: 'AND' };
  }
  m = e.match(cmp);
  if (m) {
    const b = bind(m);
    if (!b) return null;
    let op = m[5] as string;
    if (op === '<>') op = '!=';
    const rhs = m[6]!.trim();
    const val = parseScalarLiteral(rhs);
    if (!['=', '!=', '<', '>', '<=', '>='].includes(op)) return null;
    return {
      id: makeId('flt'),
      tableId: b.tid,
      column: b.col,
      operator: op as '=' | '!=' | '<' | '>' | '<=' | '>=',
      value: val,
      conjunction: 'AND',
    };
  }
  return null;
}
