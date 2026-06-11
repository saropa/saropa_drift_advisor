/**
 * Best-effort import of a flat SQLite-style SELECT into the visual query model.
 *
 * Targets the same shape [renderQuerySql] produces: quoted identifiers, AS
 * aliases, INNER/LEFT/RIGHT JOIN … ON (equality), WHERE with common predicates,
 * GROUP BY, ORDER BY, LIMIT. Unsupported constructs return [errors] or [warnings]
 * instead of silently wrong graphs.
 *
 * This file is the orchestrator only: it slices the statement into clause
 * segments and delegates each to a dedicated parser module
 * ([sql-import-from-joins], [sql-import-select-list], [sql-import-where],
 * [sql-import-group-order]). Shared low-level string helpers live in
 * [sql-import-utils].
 */
import type { TableMetadata } from '../api-client';
import { createEmptyQueryModel, type IQueryModel } from './query-model';
import {
  clausePositions,
  nextClauseEnd,
  stripSqlComments,
} from './sql-import-utils';
import { parseFromAndJoins } from './sql-import-from-joins';
import { parseSelectList } from './sql-import-select-list';
import { parseWhere } from './sql-import-where';
import { parseGroupBy, parseOrderBy } from './sql-import-group-order';

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
