import * as assert from 'assert';
import { ComplianceChecker } from '../compliance/compliance-checker';
import type { IComplianceConfig, IComplianceViolation } from '../compliance/compliance-types';
import type { TableMetadata, IDiagramForeignKey } from '../api-types';
import type { IDartTable } from '../schema-diff/dart-schema';

function makeTable(
  name: string,
  columns: Array<{ name: string; type: string; pk?: boolean }>,
): TableMetadata {
  return {
    name,
    columns: columns.map((c) => ({
      name: c.name,
      type: c.type,
      pk: c.pk ?? false,
    })),
    rowCount: 10,
  };
}

function makeFk(
  fromTable: string,
  fromColumn: string,
  toTable: string,
  toColumn = 'id',
): IDiagramForeignKey {
  return { fromTable, fromColumn, toTable, toColumn };
}

function makeDartTable(
  sqlTableName: string,
  columns: Array<{ sqlName: string; nullable?: boolean }>,
): IDartTable {
  return {
    dartClassName: sqlTableName.charAt(0).toUpperCase() + sqlTableName.slice(1),
    sqlTableName,
    columns: columns.map((c, i) => ({
      dartName: c.sqlName,
      sqlName: c.sqlName,
      dartType: 'IntColumn',
      sqlType: 'INTEGER',
      nullable: c.nullable ?? false,
      autoIncrement: false,
      line: 10 + i,
    })),
    fileUri: `file:///lib/${sqlTableName}.dart`,
    line: 5,
  };
}

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

  // ─── Required Columns ───────────────────────────────────

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

  // ─── Built-in Rule: no-text-primary-key ──────────────────

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

  // ─── Built-in Rule: require-pk ───────────────────────────

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

  // ─── Built-in Rule: max-columns ──────────────────────────

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

  // ─── Built-in Rule: no-nullable-fk ───────────────────────

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

  // ─── General Behavior ───────────────────────────────────

  describe('general', () => {
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
      // 1 table naming + 2 column naming + 1 text PK = 4
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
});
