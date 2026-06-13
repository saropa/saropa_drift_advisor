/**
 * RelationshipEngine: Unified FK relationship traversal for all features.
 *
 * Features:
 * - Walk upstream (find parent chain)
 * - Walk downstream (find dependent tree)
 * - Get affected tables for deletion
 * - Generate safe DELETE SQL in FK order
 * - Subscription for relationship changes
 *
 * Used by: Row Impact Analysis, Lineage Tracer, Data Breakpoints
 */

import * as vscode from 'vscode';
import type { DriftApiClient } from '../api-client';
import type { ForeignKey } from '../api-types';
import type {
  IAffectedTable,
  IDeletePlan,
  IRelationshipChain,
  IRelationshipNode,
} from './relationship-types';
import { createRelationshipCache } from './relationship-engine-cache';
import { q } from '../shared-utils';

const CACHE_TTL_MS = 60_000;

export class RelationshipEngine implements vscode.Disposable {
  private readonly _cache: ReturnType<typeof createRelationshipCache>;

  private readonly _onRelationshipChange = new vscode.EventEmitter<string>();
  readonly onRelationshipChange = this._onRelationshipChange.event;

  private readonly _disposables: vscode.Disposable[] = [];

  constructor(private readonly _client: DriftApiClient) {
    this._cache = createRelationshipCache(_client, CACHE_TTL_MS);
    this._disposables.push(this._onRelationshipChange);
  }

  /**
   * Walk upstream from a row to find all parent relationships.
   * Returns the chain of tables that this row depends on.
   */
  async walkUpstream(
    table: string,
    pkValue: unknown,
    maxDepth = 5,
    pkColumn = 'id',
    depth = 0,
    visited: Set<string> = new Set<string>(),
  ): Promise<IRelationshipNode> {
    const root: IRelationshipNode = {
      table,
      column: pkColumn,
      pkValue,
      pkColumn,
      depth,
      children: [],
    };

    // Cycle guard: a self/mutually-referential FK graph would otherwise recurse
    // to maxDepth on every cycle. Stop the first time a (table, pk) repeats.
    const key = `${table}:${String(pkValue)}`;
    if (maxDepth <= 0 || visited.has(key)) return root;
    visited.add(key);

    const fks = await this._cache.getForeignKeys(table);
    for (const fk of fks) {
      const fkValue = await this._getFkValue(
        table, fk.fromColumn, pkColumn, pkValue,
      );
      if (fkValue === null || fkValue === undefined) continue;

      // The parent row lives in fk.toTable, identified by fk.toColumn.
      const child = await this.walkUpstream(
        fk.toTable, fkValue, maxDepth - 1, fk.toColumn, depth + 1, visited,
      );
      child.column = fk.toColumn;
      root.children.push(child);
    }

    return root;
  }

  /**
   * Walk downstream from a row to find all dependent relationships.
   * Returns a tree of tables that reference this row.
   */
  async walkDownstream(
    table: string,
    pkValue: unknown,
    maxDepth = 3,
    maxBreadth = 10,
    pkColumn = 'id',
    depth = 0,
    visited: Set<string> = new Set<string>(),
  ): Promise<IRelationshipNode> {
    const root: IRelationshipNode = {
      table,
      column: pkColumn,
      pkValue,
      pkColumn,
      depth,
      children: [],
    };

    // Cycle guard (see walkUpstream).
    const key = `${table}:${String(pkValue)}`;
    if (maxDepth <= 0 || visited.has(key)) return root;
    visited.add(key);

    const reverseFks = await this._cache.getReverseForeignKeys(table);
    for (const fk of reverseFks.slice(0, maxBreadth)) {
      const dependentRows = await this._getDependentRows(
        fk.table, fk.column, pkValue, maxBreadth,
      );

      for (const depRow of dependentRows) {
        // Determine the dependent row's OWN primary-key column/value: prefer an
        // `id` column, else fall back to the first selected column. The delete
        // planner targets each row by THIS column, not the root's pk column.
        const childPkColumn = 'id' in depRow ? 'id' : Object.keys(depRow)[0];
        const depPkValue = depRow[childPkColumn];
        const child = await this.walkDownstream(
          fk.table, depPkValue, maxDepth - 1, maxBreadth,
          childPkColumn, depth + 1, visited,
        );
        // The link from this dependent row up to its parent is fk.column.
        child.column = fk.column;
        root.children.push(child);
      }
    }

    return root;
  }

  /**
   * Get all tables affected by deleting a row.
   * Returns a flat set of affected tables with counts.
   */
  async getAffectedTables(table: string, pkValue: unknown): Promise<IAffectedTable[]> {
    const affected: IAffectedTable[] = [];
    const seen = new Set<string>();

    const upstream = await this.walkUpstream(table, pkValue, 3);
    this._collectTables(upstream, affected, 'parent', seen);

    const downstream = await this.walkDownstream(table, pkValue, 3, 10);
    this._collectTables(downstream, affected, 'child', seen);

    return affected;
  }

  /**
   * Generate DELETE SQL statements in safe FK order (leaves first).
   */
  async generateSafeDeleteSql(
    table: string,
    pkColumn: string,
    pkValue: unknown,
  ): Promise<IDeletePlan> {
    const downstream = await this.walkDownstream(
      table, pkValue, 5, 20, pkColumn,
    );
    const statements: string[] = [];
    const affectedTables: IAffectedTable[] = [];
    const seen = new Set<string>();

    // Emit deletes for every DEPENDENT row, deepest first, each by its own pk
    // column. The root row itself is deleted last (below).
    this._generateDeleteStatements(downstream, statements, seen);

    const pkLiteral = this._sqlLiteral(pkValue);
    statements.push(
      `DELETE FROM ${q(table)} WHERE ${q(pkColumn)} = ${pkLiteral};`,
    );

    this._collectTables(downstream, affectedTables, 'child', new Set());
    affectedTables.push({ table, rowCount: 1, relationship: 'child' });

    return {
      statements,
      affectedTables,
      totalRows: statements.length,
    };
  }

  async getForeignKeys(table: string): Promise<ForeignKey[]> {
    return this._cache.getForeignKeys(table);
  }

  async getReverseForeignKeys(table: string): Promise<IRelationshipChain[]> {
    return this._cache.getReverseForeignKeys(table);
  }

  invalidate(): void {
    this._cache.clear();
  }

  /**
   * Notify listeners of a relationship change.
   */
  notifyChange(table: string): void {
    this._onRelationshipChange.fire(table);
  }

  private async _getFkValue(
    table: string,
    column: string,
    pkColumn: string,
    pkValue: unknown,
  ): Promise<unknown> {
    try {
      // Filter by the row's actual primary-key column, not a hardcoded `id` —
      // tables with a non-`id` PK previously always returned null here.
      const result = await this._client.sql(
        `SELECT ${q(column)} FROM ${q(table)} `
        + `WHERE ${q(pkColumn)} = ${this._sqlLiteral(pkValue)} LIMIT 1`,
      );
      return result.rows[0]?.[0] ?? null;
    } catch {
      return null;
    }
  }

  private async _getDependentRows(
    table: string,
    column: string,
    value: unknown,
    limit: number,
  ): Promise<Record<string, unknown>[]> {
    try {
      const result = await this._client.sql(
        `SELECT * FROM ${q(table)} `
        + `WHERE ${q(column)} = ${this._sqlLiteral(value)} LIMIT ${limit}`,
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

  private _collectTables(
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
      this._collectTables(child, result, relationship, seen);
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
  private _generateDeleteStatements(
    node: IRelationshipNode,
    statements: string[],
    seen: Set<string>,
  ): void {
    for (const child of node.children) {
      // Recurse first so a child's own dependents are deleted before the child.
      this._generateDeleteStatements(child, statements, seen);

      const key = `${child.table}:${child.pkColumn}:${String(child.pkValue)}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const pkLiteral = this._sqlLiteral(child.pkValue);
      statements.push(
        `DELETE FROM ${q(child.table)} `
        + `WHERE ${q(child.pkColumn)} = ${pkLiteral};`,
      );
    }
  }

  private _sqlLiteral(value: unknown): string {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return value ? '1' : '0';
    return `'${String(value).replace(/'/g, "''")}'`;
  }

  dispose(): void {
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}
