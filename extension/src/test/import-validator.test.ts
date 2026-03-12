/**
 * Tests for import-validator.ts
 */

import * as assert from 'assert';
import type { ColumnMetadata } from '../api-types';
import { ImportValidator } from '../import/import-validator';
import type { IImportOptions } from '../import/clipboard-import-types';

describe('ImportValidator', () => {
  const mockClient = {
    sql: async () => ({ columns: ['id'], rows: [] }),
    tableFkMeta: async () => [],
  } as any;

  const validator = new ImportValidator(mockClient);

  const columns: ColumnMetadata[] = [
    { name: 'id', type: 'INTEGER', pk: true, notnull: true },
    { name: 'name', type: 'TEXT', pk: false, notnull: true },
    { name: 'email', type: 'TEXT', pk: false, notnull: false },
    { name: 'age', type: 'INTEGER', pk: false, notnull: false },
    { name: 'score', type: 'REAL', pk: false, notnull: false },
    { name: 'active', type: 'BOOLEAN', pk: false, notnull: false },
  ];

  const defaultOptions: IImportOptions = {
    strategy: 'insert',
    matchBy: 'pk',
    continueOnError: false,
  };

  describe('validate()', () => {
    it('should pass valid data', async () => {
      const rows = [
        { id: '1', name: 'Alice', email: 'alice@example.com', age: '25' },
      ];

      const results = await validator.validate('users', rows, columns, defaultOptions);

      assert.strictEqual(results.length, 0);
    });

    it('should detect NOT NULL violation', async () => {
      const rows = [
        { id: '1', name: null },
      ];

      const results = await validator.validate('users', rows, columns, defaultOptions);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].errors.length, 1);
      assert.strictEqual(results[0].errors[0].code, 'not_null');
      assert.strictEqual(results[0].errors[0].column, 'name');
    });

    it('should detect NOT NULL violation for empty string', async () => {
      const rows = [
        { id: '1', name: '' },
      ];

      const results = await validator.validate('users', rows, columns, defaultOptions);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].errors[0].code, 'not_null');
    });

    it('should detect INTEGER type mismatch', async () => {
      const rows = [
        { id: '1', name: 'Alice', age: 'not-a-number' },
      ];

      const results = await validator.validate('users', rows, columns, defaultOptions);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].errors[0].code, 'type_mismatch');
      assert.strictEqual(results[0].errors[0].column, 'age');
    });

    it('should detect REAL type mismatch', async () => {
      const rows = [
        { id: '1', name: 'Alice', score: 'abc' },
      ];

      const results = await validator.validate('users', rows, columns, defaultOptions);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].errors[0].code, 'type_mismatch');
      assert.strictEqual(results[0].errors[0].column, 'score');
    });

    it('should accept valid REAL values', async () => {
      const rows = [
        { id: '1', name: 'Alice', score: '3.14' },
        { id: '2', name: 'Bob', score: '1e10' },
        { id: '3', name: 'Carol', score: '-2.5' },
      ];

      const results = await validator.validate('users', rows, columns, defaultOptions);

      assert.strictEqual(results.length, 0);
    });

    it('should detect BOOLEAN type mismatch', async () => {
      const rows = [
        { id: '1', name: 'Alice', active: 'maybe' },
      ];

      const results = await validator.validate('users', rows, columns, defaultOptions);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].errors[0].code, 'type_mismatch');
    });

    it('should accept valid BOOLEAN values', async () => {
      const rows = [
        { id: '1', name: 'Alice', active: 'true' },
        { id: '2', name: 'Bob', active: '0' },
        { id: '3', name: 'Carol', active: 'yes' },
      ];

      const results = await validator.validate('users', rows, columns, defaultOptions);

      assert.strictEqual(results.length, 0);
    });

    it('should accumulate multiple errors per row', async () => {
      const rows = [
        { id: '1', name: null, age: 'abc' },
      ];

      const results = await validator.validate('users', rows, columns, defaultOptions);

      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].errors.length, 2);
    });

    it('should report correct row indices', async () => {
      const rows = [
        { id: '1', name: 'Alice' },
        { id: '2', name: null },
        { id: '3', name: 'Carol' },
        { id: '4', name: null },
      ];

      const results = await validator.validate('users', rows, columns, defaultOptions);

      assert.strictEqual(results.length, 2);
      assert.strictEqual(results[0].row, 1);
      assert.strictEqual(results[1].row, 3);
    });

    it('should skip validation for null nullable columns', async () => {
      const rows = [
        { id: '1', name: 'Alice', email: null, age: null },
      ];

      const results = await validator.validate('users', rows, columns, defaultOptions);

      assert.strictEqual(results.length, 0);
    });
  });

  describe('static helpers', () => {
    it('hasErrors should return true when errors exist', () => {
      const results = [
        { row: 0, errors: [{ column: 'name', value: null, code: 'not_null' as const, message: 'test' }], warnings: [] },
      ];

      assert.strictEqual(ImportValidator.hasErrors(results), true);
    });

    it('hasErrors should return false for warnings only', () => {
      const results = [
        { row: 0, errors: [], warnings: [{ column: 'name', code: 'truncation' as const, message: 'test' }] },
      ];

      assert.strictEqual(ImportValidator.hasErrors(results), false);
    });

    it('countErrors should sum all errors', () => {
      const results = [
        { row: 0, errors: [
          { column: 'a', value: null, code: 'not_null' as const, message: '' },
          { column: 'b', value: null, code: 'not_null' as const, message: '' },
        ], warnings: [] },
        { row: 1, errors: [
          { column: 'c', value: null, code: 'not_null' as const, message: '' },
        ], warnings: [] },
      ];

      assert.strictEqual(ImportValidator.countErrors(results), 3);
    });

    it('getValidRows should filter out error rows', () => {
      const rows = ['a', 'b', 'c', 'd'];
      const results = [
        { row: 1, errors: [{ column: '', value: null, code: 'not_null' as const, message: '' }], warnings: [] },
        { row: 3, errors: [{ column: '', value: null, code: 'not_null' as const, message: '' }], warnings: [] },
      ];

      const valid = ImportValidator.getValidRows(rows, results);

      assert.deepStrictEqual(valid, ['a', 'c']);
    });
  });
});
