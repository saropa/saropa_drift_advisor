/**
 * ComplianceChecker tests: general behavior.
 */

import * as assert from 'assert';
import { ComplianceChecker } from '../compliance/compliance-checker';
import type { IComplianceConfig } from '../compliance/compliance-types';
import { makeFk, makeTable } from './compliance-checker-test-helpers';

describe('ComplianceChecker general', () => {
  let checker: ComplianceChecker;

  beforeEach(() => {
    checker = new ComplianceChecker();
  });

  it('should exclude sqlite_ internal tables', () => {
    const config: IComplianceConfig = {
      naming: { tables: 'snake_case' },
    };
    const tables = [
      makeTable('sqlite_sequence', [{ name: 'seq', type: 'INTEGER' }]),
      makeTable('users', [{ name: 'id', type: 'INTEGER', pk: true }]),
    ];
    const violations = checker.check(config, tables, []);
    assert.strictEqual(violations.length, 0);
  });

  it('should exclude tables in config.exclude', () => {
    const config: IComplianceConfig = {
      naming: { tables: 'snake_case' },
      exclude: ['MigrationTable'],
    };
    const tables = [
      makeTable('MigrationTable', [{ name: 'version', type: 'INTEGER' }]),
      makeTable('users', [{ name: 'id', type: 'INTEGER', pk: true }]),
    ];
    const violations = checker.check(config, tables, []);
    assert.strictEqual(violations.length, 0);
  });

  it('should return empty for empty config', () => {
    const config: IComplianceConfig = {};
    const tables = [makeTable('Users', [{ name: 'ID', type: 'TEXT', pk: true }])];
    const violations = checker.check(config, tables, []);
    assert.strictEqual(violations.length, 0);
  });

  it('should report multiple violations per table', () => {
    const config: IComplianceConfig = {
      naming: { tables: 'snake_case', columns: 'snake_case' },
      rules: [{ rule: 'no-text-primary-key' }],
    };
    const tables = [makeTable('BadTable', [
      { name: 'ID', type: 'TEXT', pk: true },
      { name: 'UserName', type: 'TEXT' },
    ])];
    const violations = checker.check(config, tables, []);
    assert.strictEqual(violations.length, 4);
  });

  it('should skip unknown rule names gracefully', () => {
    const config: IComplianceConfig = {
      rules: [{ rule: 'nonexistent-rule' }],
    };
    const tables = [makeTable('users', [{ name: 'id', type: 'INTEGER', pk: true }])];
    const violations = checker.check(config, tables, []);
    assert.strictEqual(violations.length, 0);
  });

  it('should exclude FKs from excluded tables', () => {
    const config: IComplianceConfig = {
      naming: { fkColumns: '{table}_id' },
      exclude: ['orders'],
    };
    const tables = [makeTable('orders', [{ name: 'bad_fk', type: 'INTEGER' }])];
    const fks = [makeFk('orders', 'bad_fk', 'users')];
    const violations = checker.check(config, tables, fks);
    assert.strictEqual(violations.length, 0);
  });
});
