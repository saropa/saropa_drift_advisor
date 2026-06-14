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
import {
  collectTables,
  generateDeleteStatements,
  getDependentRows,
  getFkValue,
  sqlLiteral,
} from './relationship-engine-sql';
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
      const fkValue = await getFkValue(
        this._client, table, fk.fromColumn, pkColumn, pkValue,
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
      const dependentRows = await getDependentRows(
        this._client, fk.table, fk.column, pkValue, maxBreadth,
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
    collectTables(upstream, affected, 'parent', seen);

    const downstream = await this.walkDownstream(table, pkValue, 3, 10);
    collectTables(downstream, affected, 'child', seen);

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
    generateDeleteStatements(downstream, statements, seen);

    const pkLiteral = sqlLiteral(pkValue);
    statements.push(
      `DELETE FROM ${q(table)} WHERE ${q(pkColumn)} = ${pkLiteral};`,
    );

    collectTables(downstream, affectedTables, 'child', new Set());
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

  dispose(): void {
    for (const d of this._disposables) {
      d.dispose();
    }
  }
}
