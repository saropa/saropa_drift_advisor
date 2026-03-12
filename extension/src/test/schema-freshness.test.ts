/**
 * Tests for schema-freshness.ts
 */

import * as assert from 'assert';
import type { ColumnMetadata } from '../api-types';
import {
  captureSchemaSnapshot,
  checkSchemaFreshness,
  computeSchemaVersion,
  getSnapshotAge,
} from '../import/schema-freshness';

describe('schema-freshness', () => {
  const columns: ColumnMetadata[] = [
    { name: 'id', type: 'INTEGER', pk: true, notnull: true },
    { name: 'name', type: 'TEXT', pk: false, notnull: true },
    { name: 'email', type: 'TEXT', pk: false, notnull: false },
  ];

  describe('computeSchemaVersion', () => {
    it('should return consistent hash for same schema', () => {
      const v1 = computeSchemaVersion(columns);
      const v2 = computeSchemaVersion(columns);

      assert.strictEqual(v1, v2);
    });

    it('should return different hash when column added', () => {
      const v1 = computeSchemaVersion(columns);
      const v2 = computeSchemaVersion([
        ...columns,
        { name: 'age', type: 'INTEGER', pk: false, notnull: false },
      ]);

      assert.notStrictEqual(v1, v2);
    });

    it('should return different hash when column type changes', () => {
      const v1 = computeSchemaVersion(columns);
      const v2 = computeSchemaVersion([
        { name: 'id', type: 'INTEGER', pk: true, notnull: true },
        { name: 'name', type: 'VARCHAR', pk: false, notnull: true },
        { name: 'email', type: 'TEXT', pk: false, notnull: false },
      ]);

      assert.notStrictEqual(v1, v2);
    });

    it('should return different hash when nullable changes', () => {
      const v1 = computeSchemaVersion(columns);
      const v2 = computeSchemaVersion([
        { name: 'id', type: 'INTEGER', pk: true, notnull: true },
        { name: 'name', type: 'TEXT', pk: false, notnull: false },
        { name: 'email', type: 'TEXT', pk: false, notnull: false },
      ]);

      assert.notStrictEqual(v1, v2);
    });

    it('should be order-independent', () => {
      const v1 = computeSchemaVersion(columns);
      const v2 = computeSchemaVersion([columns[2], columns[0], columns[1]]);

      assert.strictEqual(v1, v2);
    });
  });

  describe('captureSchemaSnapshot', () => {
    it('should capture table name', () => {
      const snapshot = captureSchemaSnapshot('users', columns);

      assert.strictEqual(snapshot.table, 'users');
    });

    it('should capture column info', () => {
      const snapshot = captureSchemaSnapshot('users', columns);

      assert.strictEqual(snapshot.columns.length, 3);
      assert.deepStrictEqual(snapshot.columns[0], {
        name: 'id',
        type: 'INTEGER',
        nullable: false,
      });
    });

    it('should compute version hash', () => {
      const snapshot = captureSchemaSnapshot('users', columns);

      assert.ok(snapshot.version);
      assert.strictEqual(typeof snapshot.version, 'string');
    });

    it('should set capturedAt timestamp', () => {
      const before = new Date();
      const snapshot = captureSchemaSnapshot('users', columns);
      const after = new Date();

      assert.ok(snapshot.capturedAt >= before);
      assert.ok(snapshot.capturedAt <= after);
    });
  });

  describe('checkSchemaFreshness', () => {
    it('should return fresh for unchanged schema', () => {
      const snapshot = captureSchemaSnapshot('users', columns);
      const result = checkSchemaFreshness(snapshot, columns);

      assert.strictEqual(result.fresh, true);
      assert.strictEqual(result.changes.length, 0);
    });

    it('should detect removed column', () => {
      const snapshot = captureSchemaSnapshot('users', columns);
      const newColumns = columns.slice(0, 2);

      const result = checkSchemaFreshness(snapshot, newColumns);

      assert.strictEqual(result.fresh, false);
      assert.ok(result.changes.some((c) => c.includes('email') && c.includes('removed')));
    });

    it('should detect added column', () => {
      const snapshot = captureSchemaSnapshot('users', columns);
      const newColumns = [
        ...columns,
        { name: 'age', type: 'INTEGER', pk: false, notnull: false },
      ];

      const result = checkSchemaFreshness(snapshot, newColumns);

      assert.strictEqual(result.fresh, false);
      assert.ok(result.changes.some((c) => c.includes('age') && c.includes('added')));
    });

    it('should detect type change', () => {
      const snapshot = captureSchemaSnapshot('users', columns);
      const newColumns: ColumnMetadata[] = [
        { name: 'id', type: 'INTEGER', pk: true, notnull: true },
        { name: 'name', type: 'VARCHAR', pk: false, notnull: true },
        { name: 'email', type: 'TEXT', pk: false, notnull: false },
      ];

      const result = checkSchemaFreshness(snapshot, newColumns);

      assert.strictEqual(result.fresh, false);
      assert.ok(result.changes.some((c) =>
        c.includes('name') && c.includes('type') && c.includes('TEXT') && c.includes('VARCHAR'),
      ));
    });

    it('should detect nullable change', () => {
      const snapshot = captureSchemaSnapshot('users', columns);
      const newColumns: ColumnMetadata[] = [
        { name: 'id', type: 'INTEGER', pk: true, notnull: true },
        { name: 'name', type: 'TEXT', pk: false, notnull: false },
        { name: 'email', type: 'TEXT', pk: false, notnull: false },
      ];

      const result = checkSchemaFreshness(snapshot, newColumns);

      assert.strictEqual(result.fresh, false);
      assert.ok(result.changes.some((c) => c.includes('name')));
    });

    it('should detect multiple changes', () => {
      const snapshot = captureSchemaSnapshot('users', columns);
      const newColumns: ColumnMetadata[] = [
        { name: 'id', type: 'INTEGER', pk: true, notnull: true },
        { name: 'age', type: 'INTEGER', pk: false, notnull: false },
      ];

      const result = checkSchemaFreshness(snapshot, newColumns);

      assert.strictEqual(result.fresh, false);
      assert.ok(result.changes.length >= 2);
    });
  });

  describe('getSnapshotAge', () => {
    it('should return seconds for recent snapshot', () => {
      const snapshot = {
        table: 'users',
        columns: [],
        version: '12345678',
        capturedAt: new Date(Date.now() - 30000),
      };

      const age = getSnapshotAge(snapshot);

      assert.ok(age.includes('s'));
      assert.ok(!age.includes('m'));
    });

    it('should return minutes for older snapshot', () => {
      const snapshot = {
        table: 'users',
        columns: [],
        version: '12345678',
        capturedAt: new Date(Date.now() - 5 * 60 * 1000),
      };

      const age = getSnapshotAge(snapshot);

      assert.ok(age.includes('m'));
    });

    it('should return hours for much older snapshot', () => {
      const snapshot = {
        table: 'users',
        columns: [],
        version: '12345678',
        capturedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      };

      const age = getSnapshotAge(snapshot);

      assert.ok(age.includes('h'));
    });

    it('should return days for very old snapshot', () => {
      const snapshot = {
        table: 'users',
        columns: [],
        version: '12345678',
        capturedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      };

      const age = getSnapshotAge(snapshot);

      assert.ok(age.includes('d'));
    });
  });
});
