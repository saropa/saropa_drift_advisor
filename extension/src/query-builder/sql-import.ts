/**
 * Best-effort import of a flat SQLite-style SELECT into the visual query model.
 *
 * Targets the same shape [renderQuerySql] produces: quoted identifiers, AS
 * aliases, INNER/LEFT/RIGHT JOIN … ON (equality), WHERE with common predicates,
 * GROUP BY, ORDER BY, LIMIT. Unsupported constructs return [errors] or [warnings]
 * instead of silently wrong graphs.
 */
import type { TableMetadata } from '../api-client';
import {
  createEmptyQueryModel,
  createTableInstance,
  makeId,
  type AggregateFn,
  type IQueryFilter,
  type IQueryJoin,
  type IQueryModel,
} from './query-model';

/** Result of attempting to parse SQL into [IQueryModel]. */
export interface ISqlImportResult {
  model: IQueryModel;
  errors: string[];
  warnings: string[];
}

/**
 * Parse `SELECT …` into a query model using `schema` for column metadata.
 * On hard [errors], [model] is an empty model.
 */
export function importSelectSqlToModel(
  rawSql: string,
  schema: TableMetadata[],
): ISqlImportResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const sql = stripSqlComments(rawSql).replace(/;\s*$/, '').trim();
  if (!sql) {
    return { model: createEmptyQueryModel(), errors: ['Empty SQL'], warnings };
  }
  if (/^\s*with\b/i.test(sql)) {
    return {
      model: createEmptyQueryModel(),
      errors: ['WITH / CTE queries cannot be imported into the visual builder yet'],
      warnings,
    };
  }
  if (!/^\s*select\b/i.test(sql)) {
    return {
      model: createEmptyQueryModel(),
      errors: ['Only SELECT statements can be imported'],
      warnings,
    };
  }
  if (/\bunion\b/i.test(sql)) {
    return {
      model: createEmptyQueryModel(),
      errors: ['UNION queries cannot be imported'],
      warnings,
    };
  }

  const fromKw = /\bFROM\b/i.exec(sql);
  if (!fromKw || fromKw.index === undefined) {
    return { model: createEmptyQueryModel(), errors: ['Missing FROM clause'], warnings };
  }

  const selectList = sql.slice(6, fromKw.index).replace(/\s+/g, ' ').trim();
  const afterFrom = sql.slice(fromKw.index + fromKw[0].length).trim();

  // Clause starts must bound FROM/JOIN and each following clause: missing GROUP BY
  // previously made WHERE run to EOF (pulling in ORDER BY/LIMIT) and made FROM
  // include LIMIT when WHERE was absent.
  const clauses = clausePositions(afterFrom);
  const fromJoinEnd =
    clauses.firstClauseStart < afterFrom.length ? clauses.firstClauseStart : afterFrom.length;
  const fromJoinSegment = afterFrom.slice(0, fromJoinEnd).trim();
  const whereSql =
    clauses.where >= 0
      ? afterFrom
          .slice(clauses.where, nextClauseEnd(afterFrom, clauses.where, clauses))
          .replace(/^\s*WHERE\s+/i, '')
          .trim()
      : '';
  const groupSql =
    clauses.groupBy >= 0
      ? afterFrom
          .slice(clauses.groupBy, nextClauseEnd(afterFrom, clauses.groupBy, clauses))
          .replace(/^\s*GROUP\s+BY\s+/i, '')
          .trim()
      : '';
  const orderSql =
    clauses.orderBy >= 0
      ? afterFrom
          .slice(clauses.orderBy, nextClauseEnd(afterFrom, clauses.orderBy, clauses))
          .replace(/^\s*ORDER\s+BY\s+/i, '')
          .trim()
      : '';
  const limitSql =
    clauses.limit >= 0
      ? afterFrom.slice(clauses.limit).replace(/^\s*LIMIT\s+/i, '').trim()
      : '';

  const tableByName = new Map(schema.map((t) => [t.name, t]));
  const model = createEmptyQueryModel();
  const aliasToInstanceId = new Map<string, string>();

  parseFromAndJoins(fromJoinSegment, model, tableByName, aliasToInstanceId, warnings, errors);
  if (errors.length > 0) {
    return { model: createEmptyQueryModel(), errors, warnings };
  }
  if (model.tables.length === 0) {
    return { model: createEmptyQueryModel(), errors: ['No tables parsed from FROM clause'], warnings };
  }

  parseSelectList(selectList, model, aliasToInstanceId, warnings, errors);
  if (errors.length > 0) {
    return { model: createEmptyQueryModel(), errors, warnings };
  }

  if (whereSql) {
    parseWhere(whereSql, model, aliasToInstanceId, warnings, errors);
  }
  if (errors.length > 0) {
    return { model: createEmptyQueryModel(), errors, warnings };
  }
  if (groupSql) {
    parseGroupBy(groupSql, model, aliasToInstanceId, errors);
  }
  if (errors.length > 0) {
    return { model: createEmptyQueryModel(), errors, warnings };
  }
  if (orderSql) {
    parseOrderBy(orderSql, model, aliasToInstanceId, errors);
  }
  if (errors.length > 0) {
    return { model: createEmptyQueryModel(), errors, warnings };
  }
  if (limitSql) {
    const lim = Number.parseInt(limitSql.split(/\s+/)[0] ?? '', 10);
    if (Number.isFinite(lim) && lim > 0) {
      model.limit = lim;
    } else {
      warnings.push(`LIMIT value not parsed: ${limitSql}`);
    }
  }

  return { model, errors, warnings };
}

function stripSqlComments(input: string): string {
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
interface IClausePositions {
  where: number;
  groupBy: number;
  orderBy: number;
  limit: number;
  /** Minimum of present clause starts, or EOF when no clause follows FROM. */
  firstClauseStart: number;
}

function clausePositions(afterFrom: string): IClausePositions {
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
function nextClauseEnd(
  afterFrom: string,
  start: number,
  c: IClausePositions,
): number {
  const len = afterFrom.length;
  const next = [c.groupBy, c.orderBy, c.limit].filter((x) => x >= 0 && x > start);
  return next.length ? Math.min(...next) : len;
}

function indexOfKeyword(haystack: string, keyword: string): number {
  const re =
    keyword === 'GROUP BY'
      ? /\bGROUP\s+BY\b/i
      : keyword === 'ORDER BY'
        ? /\bORDER\s+BY\b/i
        : new RegExp(`\\b${keyword}\\b`, 'i');
  const m = re.exec(haystack);
  return m ? m.index : -1;
}

function unquoteIdent(tok: string): string {
  if (tok.startsWith('"')) {
    return tok.replace(/^"|"$/g, '').replace(/""/g, '"');
  }
  return tok;
}

/** `"a".b` or `a.b` → { alias, col } */
function parseQualified(expr: string): { alias: string; col: string } | null {
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
function qualFromQMatch(m: RegExpMatchArray): { alias: string; col: string } {
  const alias = m[1]!.startsWith('"') ? unquoteIdent(m[1]!) : m[2]!;
  const col = m[3]!.startsWith('"') ? unquoteIdent(m[3]!) : m[4]!;
  return { alias, col };
}

/**
 * Parse FROM and chained JOINs; fills [model.tables] and [model.joins].
 */
function parseFromAndJoins(
  segment: string,
  model: IQueryModel,
  tableByName: Map<string, TableMetadata>,
  aliasToInstanceId: Map<string, string>,
  warnings: string[],
  errors: string[],
): void {
  let rest = segment.trim();
  const first = /^("(?:[^"]|"")+"|(\w+))(?:\s+(?:AS\s+)?("(?:[^"]|"")+"|(\w+)))?\s*/i.exec(rest);
  if (!first) {
    errors.push('Could not parse first table in FROM');
    return;
  }
  const tableName = first[1]
    ? first[1].startsWith('"')
      ? unquoteIdent(first[1])
      : first[1]
    : first[2]!;
  const aliasToken = first[3] || first[4];
  const alias = aliasToken
    ? first[3]?.startsWith('"')
      ? unquoteIdent(first[3])
      : first[4]!
    : tableName;
  const meta = tableByName.get(tableName);
  if (!meta) {
    errors.push(`Unknown table in schema: ${tableName}`);
    return;
  }
  const root = createTableInstance(model, meta.name, meta.columns, { forcedAlias: alias });
  model.tables.push(root);
  aliasToInstanceId.set(root.alias, root.id);
  rest = rest.slice(first[0].length).trim();

  while (rest.length > 0) {
    const jm =
      /^(INNER|LEFT|RIGHT)?\s*JOIN\s+("(?:[^"]|"")+"|(\w+))(?:\s+(?:AS\s+)?("(?:[^"]|"")+"|(\w+)))?\s+ON\s+/i.exec(
        rest,
      );
    if (!jm) {
      if (/\S/.test(rest)) {
        warnings.push(`Trailing FROM/JOIN text not parsed: ${rest.slice(0, 80)}…`);
      }
      break;
    }
    const joinType = ((jm[1] || 'INNER').toUpperCase()) as IQueryJoin['type'];
    const rtName = jm[2]
      ? jm[2].startsWith('"')
        ? unquoteIdent(jm[2])
        : jm[2]
      : jm[3]!;
    const rtAliasTok = jm[4] || jm[5];
    const rtAlias = rtAliasTok
      ? jm[4]?.startsWith('"')
        ? jm[4].replace(/^"|"$/g, '').replace(/""/g, '"')
        : jm[5]!
      : rtName;
    const afterOn = rest.slice(jm[0].length);
    const nextJoinIdx = afterOn.search(/\b(?:INNER|LEFT|RIGHT)?\s+JOIN\b/i);
    const onClause = (nextJoinIdx >= 0 ? afterOn.slice(0, nextJoinIdx) : afterOn).trim();
    rest = nextJoinIdx >= 0 ? afterOn.slice(nextJoinIdx).trim() : '';

    const metaR = tableByName.get(rtName);
    if (!metaR) {
      errors.push(`Unknown join table: ${rtName}`);
      return;
    }
    const rightInst = createTableInstance(model, metaR.name, metaR.columns, { forcedAlias: rtAlias });
    model.tables.push(rightInst);
    aliasToInstanceId.set(rightInst.alias, rightInst.id);

    const eq = parseJoinOnEquality(onClause);
    if (!eq) {
      errors.push(`Could not parse JOIN ON as column equality: ${onClause}`);
      return;
    }
    let leftId: string;
    let leftCol: string;
    let rightId: string;
    let rightCol: string;
    const newAlias = rightInst.alias;
    if (eq.leftAlias === newAlias) {
      rightId = rightInst.id;
      rightCol = eq.leftCol;
      const other = aliasToInstanceId.get(eq.rightAlias);
      if (!other) {
        errors.push(`Unknown alias in JOIN ON: ${eq.rightAlias}`);
        return;
      }
      leftId = other;
      leftCol = eq.rightCol;
    } else if (eq.rightAlias === newAlias) {
      rightId = rightInst.id;
      rightCol = eq.rightCol;
      const other = aliasToInstanceId.get(eq.leftAlias);
      if (!other) {
        errors.push(`Unknown alias in JOIN ON: ${eq.leftAlias}`);
        return;
      }
      leftId = other;
      leftCol = eq.leftCol;
    } else {
      errors.push('JOIN ON does not reference the newly joined table alias');
      return;
    }

    model.joins.push({
      id: makeId('join'),
      leftTableId: leftId,
      leftColumn: leftCol,
      rightTableId: rightId,
      rightColumn: rightCol,
      type: joinType === 'LEFT' || joinType === 'RIGHT' || joinType === 'INNER' ? joinType : 'INNER',
    });
  }
}

function parseJoinOnEquality(
  on: string,
): { leftAlias: string; leftCol: string; rightAlias: string; rightCol: string } | null {
  const t = on.replace(/\s+/g, ' ').trim();
  const eq = t.indexOf('=');
  if (eq < 0) return null;
  const left = parseQualified(t.slice(0, eq).trim());
  const right = parseQualified(t.slice(eq + 1).trim());
  if (!left || !right) return null;
  return {
    leftAlias: left.alias,
    leftCol: left.col,
    rightAlias: right.alias,
    rightCol: right.col,
  };
}

function parseSelectList(
  selectList: string,
  model: IQueryModel,
  aliasToInstanceId: Map<string, string>,
  warnings: string[],
  errors: string[],
): void {
  if (/^\*\s*$/i.test(selectList) || selectList === '*') {
    return;
  }
  const parts = splitCsvRespectingParensAndStrings(selectList);
  for (const part of parts) {
    const p = part.trim();
    if (!p) continue;
    const aggRe =
      /^(SUM|COUNT|AVG|MIN|MAX)\s*\(\s*("(?:[^"]|"")+"|(\w+))\s*\.\s*("(?:[^"]|"")+"|(\w+))\s*\)(?:\s+AS\s+("(?:[^"]|"")+"|(\w+)))?/i;
    const am = p.match(aggRe);
    if (am) {
      const fn = am[1].toUpperCase() as AggregateFn;
      const aAlias = am[2].startsWith('"')
        ? am[2].replace(/^"|"$/g, '').replace(/""/g, '"')
        : am[3]!;
      const aCol = am[4].startsWith('"')
        ? am[4].replace(/^"|"$/g, '').replace(/""/g, '"')
        : am[5]!;
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
      model.selectedColumns.push({
        tableId: tid,
        column: aCol,
        aggregation: fn,
        alias: outAlias,
      });
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

/** Split on commas outside parentheses and string literals. */
function splitCsvRespectingParensAndStrings(s: string): string[] {
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

function parseWhere(
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

function parseScalarLiteral(rhs: string): string | number | boolean {
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

function parseGroupBy(
  groupSql: string,
  model: IQueryModel,
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

function parseOrderBy(
  orderSql: string,
  model: IQueryModel,
  aliasToInstanceId: Map<string, string>,
  errors: string[],
): void {
  for (const part of splitCsvRespectingParensAndStrings(orderSql)) {
    const p = part.trim().replace(/\s+/g, ' ');
    const m = p.match(
      /^("(?:[^"]|"")+"|(\w+))\.("(?:[^"]|"")+"|(\w+))(?:\s+(ASC|DESC))?$/i,
    );
    if (!m) {
      errors.push(`ORDER BY column not understood: ${p}`);
      return;
    }
    const alias = m[1].startsWith('"')
      ? m[1].replace(/^"|"$/g, '').replace(/""/g, '"')
      : m[2]!;
    const col = m[3].startsWith('"')
      ? m[3].replace(/^"|"$/g, '').replace(/""/g, '"')
      : m[4]!;
    const dir = (m[5]?.toUpperCase() ?? 'ASC') as 'ASC' | 'DESC';
    const tid = aliasToInstanceId.get(alias);
    if (!tid) {
      errors.push(`Unknown alias in ORDER BY: ${alias}`);
      return;
    }
    model.orderBy.push({ tableId: tid, column: col, direction: dir === 'DESC' ? 'DESC' : 'ASC' });
  }
}
