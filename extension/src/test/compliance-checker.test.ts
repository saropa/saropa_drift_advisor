import * as assert from 'assert';
import { ComplianceChecker } from '../compliance/compliance-checker';
import type { IComplianceConfig } from '../compliance/compliance-types';
import { makeFk, makeTable, makeDartTable } from './compliance-checker-test-helpers';

describe('ComplianceChecker', () => {
  let checker: ComplianceChecker;

  beforeEach(() => {
    checker = new ComplianceChecker();
  });

  // ─── Naming: Tables ─────────────────────────────────────

  describe('naming.tables', () => {
    const config: IComplianceConfig = {
      naming: { tables: 'snake_case' },
    };

    it('should pass valid snake_case table names', () => {
      const tables = [makeTable('user_accounts', [{ name: 'id', type: 'INTEGER', pk: true }])];
      const violations = checker.check(config, tables, []);
      assert.strictEqual(violations.length, 0);
    });

    it('should flag non-snake_case table names', () => {
      const tables = [makeTable('UserAccounts', [{ name: 'id', type: 'INTEGER', pk: true }])];
      const violations = checker.check(config, tables, []);
      assert.strictEqual(violations.length, 1);
      assert.strictEqual(violations[0].rule, 'compliance-table-naming');
      assert.strictEqual(violations[0].table, 'UserAccounts');
    });

    it('should respect severity override', () => {
      const cfg: IComplianceConfig = {
        naming: { tables: 'snake_case', severity: 'error' },
      };
      const tables = [makeTable('BadName', [{ name: 'id', type: 'INTEGER', pk: true }])];
      const violations = checker.check(cfg, tables, []);
      assert.strictEqual(violations[0].severity, 'error');
    });
  });

  // ─── Naming: Columns ────────────────────────────────────

  describe('naming.columns', () => {
    const config: IComplianceConfig = {
      naming: { columns: 'snake_case' },
    };

    it('should pass valid snake_case column names', () => {
      const tables = [makeTable('users', [
        { name: 'user_name', type: 'TEXT' },
        { name: 'created_at', type: 'INTEGER' },
      ])];
      const violations = checker.check(config, tables, []);
      assert.strictEqual(violations.length, 0);
    });

    it('should flag non-snake_case column names', () => {
      const tables = [makeTable('users', [
        { name: 'userName', type: 'TEXT' },
        { name: 'OrderDate', type: 'INTEGER' },
      ])];
      const violations = checker.check(config, tables, []);
      assert.strictEqual(violations.length, 2);
      assert.ok(violations.every((v) => v.rule === 'compliance-column-naming'));
    });
  });

  // ─── Naming: FK Columns ─────────────────────────────────

  describe('naming.fkColumns', () => {
    const config: IComplianceConfig = {
      naming: { fkColumns: '{table}_id' },
    };

    it('should pass matching FK column pattern', () => {
      const tables = [makeTable('orders', [{ name: 'user_id', type: 'INTEGER' }])];
      const fks = [makeFk('orders', 'user_id', 'user')];
      const violations = checker.check(config, tables, fks);
      assert.strictEqual(violations.length, 0);
    });

    it('should flag non-matching FK column', () => {
      const tables = [makeTable('orders', [{ name: 'userId', type: 'INTEGER' }])];
      const fks = [makeFk('orders', 'userId', 'users')];
      const violations = checker.check(config, tables, fks);
      assert.strictEqual(violations.length, 1);
      assert.strictEqual(violations[0].rule, 'compliance-fk-naming');
      assert.ok(violations[0].message.includes('users_id'));
    });

    it('should handle multi-word table name in FK pattern', () => {
      const tables = [makeTable('orders', [{ name: 'user_accounts_id', type: 'INTEGER' }])];
      const fks = [makeFk('orders', 'user_accounts_id', 'user_accounts')];
      const violations = checker.check(config, tables, fks);
      assert.strictEqual(violations.length, 0);
    });
  });
});
