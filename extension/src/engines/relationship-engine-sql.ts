/**
 * SQL literal/query helpers and relationship-tree walkers for RelationshipEngine.
 * Extracted to keep relationship-engine.ts under 300 lines.
 *
 * These are free functions (no engine state) so they stay unit-testable in
 * isolation; the engine passes its API client in where a query is needed.
 */

import type { DriftApiClient } from '../api-client';
import type { IAffectedTable, IRelationshipNode } from './relationship-types';
import { q } from '../shared-utils';

/**
 * Render a JS value as a SQL literal. Strings are single-quote escaped; this is
 * the single place value-to-SQL coercion happens, so callers never concatenate
 * raw values into a query.
 */
export function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Read a single foreign-key column value from a row identified by its primary
 * key. Returns null on any error or missing row.
 */
export async function getFkValue(
  client: DriftApiClient,
  table: string,
  column: string,
  pkColumn: string,
  pkValue: unknown,
): Promise<unknown> {
  try {
    // Filter by the row's actual primary-key column, not a hardcoded `id` —
    // tables with a non-`id` PK previously always returned null here.
    const result = await client.sql(
      `SELECT ${q(column)} FROM ${q(table)} `
      + `WHERE ${q(pkColumn)} = ${sqlLiteral(pkValue)} LIMIT 1`,
    );
    return result.rows[0]?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch up to [limit] rows that reference [value] via [column], each returned as
 * a column-name -> value record. Returns an empty array on any error.
 */
export async function getDependentRows(
  client: DriftApiClient,
  table: string,
  column: string,
  value: unknown,
  limit: number,
): Promise<Record<string, unknown>[]> {
  try {
    const result = await client.sql(
      `SELECT * FROM ${q(table)} `
      + `WHERE ${q(column)} = ${sqlLiteral(value)} LIMIT ${limit}`,
    );
    return result.rows.map((row, idx) => {
      const obj: Record<string, unknown> = {};
      result.columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      obj._rowIndex = idx;
      return obj;
    });
  } catch {
    return [];
  }
}

/**
 * Flatten a relationship subtree into a deduplicated list of affected tables.
 */
export function collectTables(
  node: IRelationshipNode,
  result: IAffectedTable[],
  relationship: 'parent' | 'child',
  seen: Set<string>,
): void {
  if (seen.has(node.table)) return;
  seen.add(node.table);

  result.push({
    table: node.table,
    rowCount: 1,
    relationship,
  });

  for (const child of node.children) {
    collectTables(child, result, relationship, seen);
  }
}

/**
 * Emits a DELETE for every DEPENDENT node in [node]'s subtree, deepest first,
 * each targeting its own table and primary-key column. The subtree root itself
 * is NOT emitted (the caller deletes the root row separately) — but every
 * descendant IS, including leaves: leaf rows are exactly the ones that hold the
 * foreign keys blocking the parent delete, so skipping them (the prior
 * `children.length > 0` gate) left the delete plan unable to complete.
 */
export function generateDeleteStatements(
  node: IRelationshipNode,
  statements: string[],
  seen: Set<string>,
): void {
  for (const child of node.children) {
    // Recurse first so a child's own dependents are deleted before the child.
    generateDeleteStatements(child, statements, seen);

    const key = `${child.table}:${child.pkColumn}:${String(child.pkValue)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const pkLiteral = sqlLiteral(child.pkValue);
    statements.push(
      `DELETE FROM ${q(child.table)} `
      + `WHERE ${q(child.pkColumn)} = ${pkLiteral};`,
    );
  }
}
