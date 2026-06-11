/**
 * Shared flat-SELECT → query-model importer (Feature 21, Phase 1).
 *
 * Orchestrates clause segmentation and FROM/JOIN parsing, delegating the
 * model-shape-agnostic clauses to [query-builder-core-import-clauses]. Table
 * instances are created through an injected [CoreTableFactory], so the extension
 * (initials aliases + canvas `position`, via `createTableInstance`) and the web
 * (`tN` aliases, no position) each keep their own model semantics while sharing
 * one parser — replacing the previously hand-synced extension `sql-import*.ts`
 * and web `query-builder-import.ts` copies.
 *
 * Self-contained except for sibling core modules (no `api-client`/`vscode`), so
 * it compiles into both the extension (tsc) and the web bundle (esbuild).
 */
import type { CoreColumn, CoreModel, CoreTable } from './query-builder-core';
import {
  clausePositions,
  makeImportId,
  nextClauseEnd,
  parseQualified,
  stripSqlComments,
  unquoteIdent,
} from './query-builder-core-parse';
import {
  parseGroupBy,
  parseOrderBy,
  parseSelectList,
  parseWhere,
} from './query-builder-core-import-clauses';

/** Minimal schema-table shape the importer needs (name + columns). */
export interface CoreImportSchemaTable {
  name: string;
  columns?: CoreColumn[];
}

/**
 * Creates a table instance, pushes it onto [model.tables], and returns it. The
 * factory owns alias selection (honoring [forcedAlias] when free) and any
 * surface-specific fields (e.g. canvas `position`).
 */
export type CoreTableFactory = (
  model: CoreModel,
  baseTable: string,
  columns: CoreColumn[],
  forcedAlias: string,
) => CoreTable;

export interface CoreImportDeps {
  /** Fresh empty model (carries the surface's default LIMIT). */
  createEmpty: () => CoreModel;
  makeTable: CoreTableFactory;
}

export interface CoreImportResult {
  /** Built model, or null on any hard error (caller preserves prior state). */
  model: CoreModel | null;
  errors: string[];
  warnings: string[];
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
  return { leftAlias: left.alias, leftCol: left.col, rightAlias: right.alias, rightCol: right.col };
}

function parseFromAndJoins(
  segment: string,
  model: CoreModel,
  tableByName: Map<string, CoreImportSchemaTable>,
  aliasToInstanceId: Map<string, string>,
  makeTable: CoreTableFactory,
  warnings: string[],
  errors: string[],
): void {
  let rest = segment.trim();
  const first = /^("(?:[^"]|"")+"|(\w+))(?:\s+(?:AS\s+)?("(?:[^"]|"")+"|(\w+)))?\s*/i.exec(rest);
  if (!first) {
    errors.push('Could not parse first table in FROM');
    return;
  }
  const tableName = first[1]!.startsWith('"') ? unquoteIdent(first[1]!) : (first[2] ?? first[1]!);
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
  const root = makeTable(model, meta.name, meta.columns ?? [], alias);
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
    const joinType = (jm[1] || 'INNER').toUpperCase();
    const rtName = jm[2]!.startsWith('"') ? unquoteIdent(jm[2]!) : (jm[3] ?? jm[2]!);
    const rtAliasTok = jm[4] || jm[5];
    const rtAlias = rtAliasTok
      ? jm[4]?.startsWith('"')
        ? unquoteIdent(jm[4])
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
    const rightInst = makeTable(model, metaR.name, metaR.columns ?? [], rtAlias);
    aliasToInstanceId.set(rightInst.alias, rightInst.id);

    const eq = parseJoinOnEquality(onClause);
    if (!eq) {
      errors.push(`Could not parse JOIN ON as column equality: ${onClause}`);
      return;
    }
    // The freshly joined instance must be one side of the ON equality; the other
    // side resolves to an already-registered alias. Keeps the model's join
    // direction (right = new instance) consistent with the renderer.
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
      id: makeImportId('join'),
      leftTableId: leftId,
      leftColumn: leftCol,
      rightTableId: rightId,
      rightColumn: rightCol,
      type: joinType === 'LEFT' || joinType === 'RIGHT' || joinType === 'INNER' ? joinType : 'INNER',
    });
  }
}

/**
 * Parse a flat `SELECT …` into a [CoreModel] using [schemaTables] for column
 * metadata. Returns `{ model: null, errors }` on any hard failure.
 */
export function importSelectSqlToCoreModel(
  rawSql: string,
  schemaTables: CoreImportSchemaTable[],
  deps: CoreImportDeps,
): CoreImportResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const sql = stripSqlComments(rawSql).replace(/;\s*$/, '').trim();
  if (!sql) return { model: null, errors: ['Empty SQL'], warnings };
  if (/^\s*with\b/i.test(sql)) {
    return { model: null, errors: ['WITH / CTE queries cannot be imported into the visual builder yet'], warnings };
  }
  if (!/^\s*select\b/i.test(sql)) {
    return { model: null, errors: ['Only SELECT statements can be imported'], warnings };
  }
  if (/\bunion\b/i.test(sql)) {
    return { model: null, errors: ['UNION queries cannot be imported'], warnings };
  }

  const fromKw = /\bFROM\b/i.exec(sql);
  if (!fromKw || fromKw.index === undefined) {
    return { model: null, errors: ['Missing FROM clause'], warnings };
  }

  const selectList = sql.slice(6, fromKw.index).replace(/\s+/g, ' ').trim();
  const afterFrom = sql.slice(fromKw.index + fromKw[0].length).trim();

  // Clause boundaries bound FROM/JOIN and each following clause so a missing
  // GROUP BY does not let WHERE swallow ORDER BY/LIMIT.
  const clauses = clausePositions(afterFrom);
  const fromJoinEnd =
    clauses.firstClauseStart < afterFrom.length ? clauses.firstClauseStart : afterFrom.length;
  const fromJoinSegment = afterFrom.slice(0, fromJoinEnd).trim();
  const whereSql =
    clauses.where >= 0
      ? afterFrom.slice(clauses.where, nextClauseEnd(afterFrom, clauses.where, clauses)).replace(/^\s*WHERE\s+/i, '').trim()
      : '';
  const groupSql =
    clauses.groupBy >= 0
      ? afterFrom.slice(clauses.groupBy, nextClauseEnd(afterFrom, clauses.groupBy, clauses)).replace(/^\s*GROUP\s+BY\s+/i, '').trim()
      : '';
  const orderSql =
    clauses.orderBy >= 0
      ? afterFrom.slice(clauses.orderBy, nextClauseEnd(afterFrom, clauses.orderBy, clauses)).replace(/^\s*ORDER\s+BY\s+/i, '').trim()
      : '';
  const limitSql =
    clauses.limit >= 0 ? afterFrom.slice(clauses.limit).replace(/^\s*LIMIT\s+/i, '').trim() : '';

  const tableByName = new Map<string, CoreImportSchemaTable>((schemaTables || []).map((t) => [t.name, t]));
  const model = deps.createEmpty();
  const aliasToInstanceId = new Map<string, string>();

  parseFromAndJoins(fromJoinSegment, model, tableByName, aliasToInstanceId, deps.makeTable, warnings, errors);
  if (errors.length > 0) return { model: null, errors, warnings };
  if (model.tables.length === 0) {
    return { model: null, errors: ['No tables parsed from FROM clause'], warnings };
  }

  parseSelectList(selectList, model, aliasToInstanceId, warnings, errors);
  if (errors.length > 0) return { model: null, errors, warnings };

  if (whereSql) parseWhere(whereSql, model, aliasToInstanceId, warnings, errors);
  if (errors.length > 0) return { model: null, errors, warnings };

  if (groupSql) parseGroupBy(groupSql, model, aliasToInstanceId, errors);
  if (errors.length > 0) return { model: null, errors, warnings };

  if (orderSql) parseOrderBy(orderSql, model, aliasToInstanceId, errors);
  if (errors.length > 0) return { model: null, errors, warnings };

  if (limitSql) {
    const lim = Number.parseInt(limitSql.split(/\s+/)[0] ?? '', 10);
    if (Number.isFinite(lim) && lim > 0) model.limit = lim;
    else warnings.push(`LIMIT value not parsed: ${limitSql}`);
  }

  return { model, errors, warnings };
}
