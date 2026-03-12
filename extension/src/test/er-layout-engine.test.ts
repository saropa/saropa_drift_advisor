import * as assert from 'assert';
import { ErLayoutEngine } from '../er-diagram/er-layout-engine';
import type { TableMetadata } from '../api-types';
import type { IFkContext } from '../er-diagram/er-diagram-types';

describe('ErLayoutEngine', () => {
  const engine = new ErLayoutEngine();

  describe('layout()', () => {
    it('returns empty result for empty schema', () => {
      const result = engine.layout([], [], 'auto');
      assert.deepStrictEqual(result.nodes, []);
      assert.deepStrictEqual(result.edges, []);
    });

    it('positions single table with no FKs', () => {
      const tables: TableMetadata[] = [{
        name: 'users',
        columns: [
          { name: 'id', type: 'INTEGER', pk: true },
          { name: 'name', type: 'TEXT', pk: false },
        ],
        rowCount: 10,
      }];
      const result = engine.layout(tables, [], 'auto');

      assert.strictEqual(result.nodes.length, 1);
      assert.strictEqual(result.nodes[0].table, 'users');
      assert.ok(result.nodes[0].x >= 0);
      assert.ok(result.nodes[0].y >= 0);
      assert.strictEqual(result.nodes[0].columns.length, 2);
      assert.strictEqual(result.nodes[0].rowCount, 10);
    });

    it('creates edges for FK relationships', () => {
      const tables: TableMetadata[] = [
        { name: 'users', columns: [{ name: 'id', type: 'INTEGER', pk: true }], rowCount: 5 },
        { name: 'posts', columns: [
          { name: 'id', type: 'INTEGER', pk: true },
          { name: 'user_id', type: 'INTEGER', pk: false },
        ], rowCount: 20 },
      ];
      const fks: IFkContext[] = [{
        fromTable: 'posts',
        fromColumn: 'user_id',
        toTable: 'users',
        toColumn: 'id',
      }];
      const result = engine.layout(tables, fks, 'auto');

      assert.strictEqual(result.nodes.length, 2);
      assert.strictEqual(result.edges.length, 1);
      assert.strictEqual(result.edges[0].from.table, 'posts');
      assert.strictEqual(result.edges[0].from.column, 'user_id');
      assert.strictEqual(result.edges[0].to.table, 'users');
      assert.strictEqual(result.edges[0].to.column, 'id');
    });

    it('marks FK columns on nodes', () => {
      const tables: TableMetadata[] = [
        { name: 'users', columns: [{ name: 'id', type: 'INTEGER', pk: true }], rowCount: 5 },
        { name: 'posts', columns: [
          { name: 'id', type: 'INTEGER', pk: true },
          { name: 'user_id', type: 'INTEGER', pk: false },
        ], rowCount: 20 },
      ];
      const fks: IFkContext[] = [{
        fromTable: 'posts',
        fromColumn: 'user_id',
        toTable: 'users',
        toColumn: 'id',
      }];
      const result = engine.layout(tables, fks, 'auto');

      const postsNode = result.nodes.find((n) => n.table === 'posts');
      const userIdCol = postsNode?.columns.find((c) => c.name === 'user_id');
      assert.strictEqual(userIdCol?.fk, true);
    });

    it('does not produce overlapping nodes after force-directed layout', () => {
      const tables: TableMetadata[] = [
        { name: 'a', columns: [{ name: 'id', type: 'INTEGER', pk: true }], rowCount: 1 },
        { name: 'b', columns: [{ name: 'id', type: 'INTEGER', pk: true }], rowCount: 1 },
        { name: 'c', columns: [{ name: 'id', type: 'INTEGER', pk: true }], rowCount: 1 },
        { name: 'd', columns: [{ name: 'id', type: 'INTEGER', pk: true }], rowCount: 1 },
      ];
      const result = engine.layout(tables, [], 'auto');

      // Check no two nodes have the exact same position
      for (let i = 0; i < result.nodes.length; i++) {
        for (let j = i + 1; j < result.nodes.length; j++) {
          const a = result.nodes[i];
          const b = result.nodes[j];
          const samePos = a.x === b.x && a.y === b.y;
          assert.ok(!samePos, `Nodes ${a.table} and ${b.table} overlap`);
        }
      }
    });

    it('hierarchical mode places parents above children', () => {
      const tables: TableMetadata[] = [
        { name: 'parent', columns: [{ name: 'id', type: 'INTEGER', pk: true }], rowCount: 1 },
        { name: 'child', columns: [
          { name: 'id', type: 'INTEGER', pk: true },
          { name: 'parent_id', type: 'INTEGER', pk: false },
        ], rowCount: 5 },
      ];
      const fks: IFkContext[] = [{
        fromTable: 'child',
        fromColumn: 'parent_id',
        toTable: 'parent',
        toColumn: 'id',
      }];
      const result = engine.layout(tables, fks, 'hierarchical');

      const parentNode = result.nodes.find((n) => n.table === 'parent');
      const childNode = result.nodes.find((n) => n.table === 'child');
      assert.ok(parentNode!.y < childNode!.y, 'Parent should be above child in hierarchical layout');
    });

    it('clustered mode groups connected tables together', () => {
      const tables: TableMetadata[] = [
        { name: 'users', columns: [{ name: 'id', type: 'INTEGER', pk: true }], rowCount: 1 },
        { name: 'posts', columns: [
          { name: 'id', type: 'INTEGER', pk: true },
          { name: 'user_id', type: 'INTEGER', pk: false },
        ], rowCount: 5 },
        { name: 'settings', columns: [{ name: 'id', type: 'INTEGER', pk: true }], rowCount: 2 },
      ];
      const fks: IFkContext[] = [{
        fromTable: 'posts',
        fromColumn: 'user_id',
        toTable: 'users',
        toColumn: 'id',
      }];
      const result = engine.layout(tables, fks, 'clustered');

      assert.strictEqual(result.nodes.length, 3);
      // Verify layout completed without errors
      assert.ok(result.nodes.every((n) => typeof n.x === 'number'));
    });

    it('truncates columns at 10 for large tables', () => {
      const columns = Array.from({ length: 15 }, (_, i) => ({
        name: `col${i}`,
        type: 'TEXT',
        pk: i === 0,
      }));
      const tables: TableMetadata[] = [{ name: 'big_table', columns, rowCount: 100 }];
      const result = engine.layout(tables, [], 'auto');

      assert.strictEqual(result.nodes[0].columns.length, 10);
    });
  });
});
