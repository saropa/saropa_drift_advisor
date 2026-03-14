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
  ): Promise<IRelationshipNode> {
    const fks = await this._cache.getForeignKeys(table);
    const root: IRelationshipNode = {
      table,
      column: 'id',
      pkValue,
      depth: 0,
      children: [],
    };

    if (maxDepth <= 0) return root;

    for (const fk of fks) {
      const fkValue = await this._getFkValue(table, fk.fromColumn, pkValue);
      if (fkValue === null || fkValue === undefined) continue;

      const child = await this.walkUpstream(fk.toTable, fkValue, maxDepth - 1);
      child.column = fk.toColumn;
      child.depth = 1;
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
  ): Promise<IRelationshipNode> {
    const reverseFks = await this._cache.getReverseForeignKeys(table);
    const root: IRelationshipNode = {
      table,
      column: 'id',
      pkValue,
      depth: 0,
      children: [],
    };

    if (maxDepth <= 0) return root;

    for (const fk of reverseFks.slice(0, maxBreadth)) {
      const dependentRows = await this._getDependentRows(
        fk.table, fk.column, pkValue, maxBreadth,
      );

      for (const depRow of dependentRows) {
        const depPkValue = depRow.id ?? depRow[Object.keys(depRow)[0]];
        const child = await this.walkDownstream(
          fk.table, depPkValue, maxDepth - 1, maxBreadth,
        );
        child.column = fk.column;
        child.depth = 1;
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
    const downstream = await this.walkDownstream(table, pkValue, 5, 20);
    const statements: string[] = [];
    const affectedTables: IAffectedTable[] = [];
    const seen = new Set<string>();

    this._generateDeleteStatements(downstream, pkColumn, statements, seen);

    const pkLiteral = this._sqlLiteral(pkValue);
    statements.push(`DELETE FROM "${table}" WHERE "${pkColumn}" = ${pkLiteral};`);

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
    pkValue: unknown,
  ): Promise<unknown> {
    try {
      const result = await this._client.sql(
        `SELECT "${column}" FROM "${table}" WHERE id = ${this._sqlLiteral(pkValue)} LIMIT 1`,
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
        `SELECT * FROM "${table}" WHERE "${column}" = ${this._sqlLiteral(value)} LIMIT ${limit}`,
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

  private _generateDeleteStatements(
    node: IRelationshipNode,
    pkColumn: string,
    statements: string[],
    seen: Set<string>,
  ): void {
    for (const child of node.children) {
      this._generateDeleteStatements(child, pkColumn, statements, seen);
    }

    const key = `${node.table}:${node.pkValue}`;
    if (seen.has(key)) return;
    seen.add(key);

    if (node.children.length > 0) {
      const pkLiteral = this._sqlLiteral(node.pkValue);
      statements.push(
        `DELETE FROM "${node.table}" WHERE "${pkColumn}" = ${pkLiteral};`,
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
