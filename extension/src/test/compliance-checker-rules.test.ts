/**
 * ComplianceChecker tests: requiredColumns and built-in rules.
 */

import * as assert from 'assert';
import { ComplianceChecker } from '../compliance/compliance-checker';
import type { IComplianceConfig } from '../compliance/compliance-types';
import { makeFk, makeTable, makeDartTable } from './compliance-checker-test-helpers';

describe('ComplianceChecker rules', () => {
  let checker: ComplianceChecker;

  beforeEach(() => {
    checker = new ComplianceChecker();
  });

  describe('requiredColumns', () => {
    it('should pass when required column exists', () => {
      const config: IComplianceConfig = {
        requiredColumns: [{ name: 'created_at', type: 'INTEGER' }],
      };
      const tables = [makeTable('users', [
        { name: 'id', type: 'INTEGER', pk: true },
        { name: 'created_at', type: 'INTEGER' },
      ])];
      const violations = checker.check(config, tables, []);
      assert.strictEqual(violations.length, 0);
    });

    it('should flag missing required column', () => {
      const config: IComplianceConfig = {
        requiredColumns: [{ name: 'updated_at', type: 'INTEGER' }],
      };
      const tables = [makeTable('users', [{ name: 'id', type: 'INTEGER', pk: true }])];
      const violations = checker.check(config, tables, []);
      assert.strictEqual(violations.length, 1);
      assert.strictEqual(violations[0].rule, 'compliance-required-column');
      assert.ok(violations[0].message.includes('updated_at'));
    });

    it('should flag wrong type for required column', () => {
      const config: IComplianceConfig = {
        requiredColumns: [{ name: 'created_at', type: 'INTEGER' }],
      };
      const tables = [makeTable('users', [
        { name: 'id', type: 'INTEGER', pk: true },
        { name: 'created_at', type: 'TEXT' },
      ])];
      const violations = checker.check(config, tables, []);
      assert.strictEqual(violations.length, 1);
      assert.strictEqual(violations[0].rule, 'compliance-required-column-type');
    });

    it('should skip excluded tables', () => {
      const config: IComplianceConfig = {
        requiredColumns: [{
          name: 'created_at',
          type: 'INTEGER',
          excludeTables: ['migrations'],
        }],
      };
      const tables = [
        makeTable('users', [{ name: 'id', type: 'INTEGER', pk: true }]),
        makeTable('migrations', [{ name: 'version', type: 'INTEGER' }]),
      ];
      const violations = checker.check(config, tables, []);
      assert.strictEqual(violations.length, 1);
      assert.strictEqual(violations[0].table, 'users');
    });

    it('should accept any type when type is not specified', () => {
      const config: IComplianceConfig = {
        requiredColumns: [{ name: 'created_at' }],
      };
      const tables = [makeTable('users', [
        { name: 'id', type: 'INTEGER', pk: true },
        { name: 'created_at', type: 'TEXT' },
      ])];
      const violations = checker.check(config, tables, []);
      assert.strictEqual(violations.length, 0);
    });

    it('should respect severity override', () => {
      const config: IComplianceConfig = {
        requiredColumns: [{ name: 'created_at', severity: 'error' }],
      };
      const tables = [makeTable('users', [{ name: 'id', type: 'INTEGER', pk: true }])];
      const violations = checker.check(config, tables, []);
      assert.strictEqual(violations[0].severity, 'error');
    });
  });

  describe('no-text-primary-key', () => {
    const config: IComplianceConfig = {
      rules: [{ rule: 'no-text-primary-key' }],
    };

    it('should flag TEXT primary key', () => {
      const tables = [makeTable('users', [{ name: 'id', type: 'TEXT', pk: true }])];
      const violations = checker.check(config, tables, []);
      assert.strictEqual(violations.length, 1);
      assert.strictEqual(violations[0].rule, 'compliance-no-text-pk');
    });

    it('should pass INTEGER primary key', () => {
      const tables = [makeTable('users', [{ name: 'id', type: 'INTEGER', pk: true }])];
      const violations = checker.check(config, tables, []);
      assert.strictEqual(violations.length, 0);
    });
  });

  describe('require-pk', () => {
    const config: IComplianceConfig = {
      rules: [{ rule: 'require-pk' }],
    };

    it('should flag table with no primary key', () => {
      const tables = [makeTable('logs', [{ name: 'message', type: 'TEXT' }])];
      const violations = checker.check(config, tables, []);
      assert.strictEqual(violations.length, 1);
      assert.strictEqual(violations[0].rule, 'compliance-require-pk');
    });

    it('should pass table with primary key', () => {
      const tables = [makeTable('users', [{ name: 'id', type: 'INTEGER', pk: true }])];
      const violations = checker.check(config, tables, []);
      assert.strictEqual(violations.length, 0);
    });
  });

  describe('max-columns', () => {
    it('should flag table exceeding max columns', () => {
      const config: IComplianceConfig = {
        rules: [{ rule: 'max-columns', max: 3 }],
      };
      const columns = Array.from({ length: 4 }, (_, i) => ({
        name: `col${i}`,
        type: 'TEXT',
      }));
      const tables = [makeTable('wide_table', columns)];
      const violations = checker.check(config, tables, []);
      assert.strictEqual(violations.length, 1);
      assert.strictEqual(violations[0].rule, 'compliance-max-columns');
      assert.ok(violations[0].message.includes('4'));
      assert.ok(violations[0].message.includes('3'));
    });

    it('should pass table within limit', () => {
      const config: IComplianceConfig = {
        rules: [{ rule: 'max-columns', max: 5 }],
      };
      const tables = [makeTable('narrow', [
        { name: 'id', type: 'INTEGER', pk: true },
        { name: 'name', type: 'TEXT' },
      ])];
      const violations = checker.check(config, tables, []);
      assert.strictEqual(violations.length, 0);
    });

    it('should use default max of 20', () => {
      const config: IComplianceConfig = {
        rules: [{ rule: 'max-columns' }],
      };
      const columns = Array.from({ length: 21 }, (_, i) => ({
        name: `col${i}`,
        type: 'TEXT',
      }));
      const tables = [makeTable('huge', columns)];
      const violations = checker.check(config, tables, []);
      assert.strictEqual(violations.length, 1);
    });
  });

  describe('no-nullable-fk', () => {
    const config: IComplianceConfig = {
      rules: [{ rule: 'no-nullable-fk' }],
    };

    it('should flag nullable FK column', () => {
      const tables = [makeTable('orders', [{ name: 'user_id', type: 'INTEGER' }])];
      const fks = [makeFk('orders', 'user_id', 'users')];
      const dartTables = [makeDartTable('orders', [{ sqlName: 'user_id', nullable: true }])];
      const violations = checker.check(config, tables, fks, dartTables);
      assert.strictEqual(violations.length, 1);
      assert.strictEqual(violations[0].rule, 'compliance-no-nullable-fk');
    });

    it('should pass non-nullable FK column', () => {
      const tables = [makeTable('orders', [{ name: 'user_id', type: 'INTEGER' }])];
      const fks = [makeFk('orders', 'user_id', 'users')];
      const dartTables = [makeDartTable('orders', [{ sqlName: 'user_id', nullable: false }])];
      const violations = checker.check(config, tables, fks, dartTables);
      assert.strictEqual(violations.length, 0);
    });

    it('should skip when dartTables is undefined', () => {
      const tables = [makeTable('orders', [{ name: 'user_id', type: 'INTEGER' }])];
      const fks = [makeFk('orders', 'user_id', 'users')];
      const violations = checker.check(config, tables, fks, undefined);
      assert.strictEqual(violations.length, 0);
    });
  });
});
