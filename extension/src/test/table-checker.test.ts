/**
 * Unit tests for table-level schema checkers.
 *
 * Covers `checkMissingTableInDb` and `checkExtraTablesInDb` from
 * `extension/src/diagnostics/checkers/table-checker.ts`.
 *
 * These tests validate the fixes for the "false positives in non-Drift
 * projects" bug — specifically root cause 3 (wrong file attribution for
 * extra-table-in-db) and general correctness of both checkers.
 */

import * as assert from 'assert';
import { Uri } from './vscode-mock-classes';
import type { IDartFileInfo, IDiagnosticIssue } from '../diagnostics/diagnostic-types';
import type { TableMetadata } from '../api-types';
import { createDartFile } from './diagnostic-test-helpers';
import {
  checkExtraTablesInDb,
  checkMissingTableInDb,
} from '../diagnostics/checkers/table-checker';

/** Build a minimal `TableMetadata` for testing. */
function createDbTable(name: string, columns: string[] = ['id']): TableMetadata {
  return {
    name,
    columns: columns.map((c) => ({
      name: c,
      type: 'INTEGER',
      pk: c === 'id',
    })),
    rowCount: 0,
  };
}

describe('checkMissingTableInDb', () => {
  it('should report when Dart table has no matching DB table', () => {
    const file = createDartFile('users', ['id', 'name']);
    const issues: IDiagnosticIssue[] = [];

    checkMissingTableInDb(issues, file, file.tables[0], undefined);

    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].code, 'missing-table-in-db');
    assert.ok(issues[0].message.includes('users'));
  });

  it('should NOT report when Dart table has a matching DB table', () => {
    const file = createDartFile('users', ['id', 'name']);
    const dbTable = createDbTable('users', ['id', 'name']);
    const issues: IDiagnosticIssue[] = [];

    checkMissingTableInDb(issues, file, file.tables[0], dbTable);

    assert.strictEqual(issues.length, 0);
  });
});

describe('checkExtraTablesInDb', () => {
  it('should report DB tables not defined in Dart', () => {
    const dartFiles = [createDartFile('users', ['id', 'name'])];
    const dbTableMap = new Map<string, TableMetadata>([
      ['users', createDbTable('users')],
      ['legacy_archive', createDbTable('legacy_archive')],
    ]);
    const issues: IDiagnosticIssue[] = [];

    checkExtraTablesInDb(issues, dbTableMap, dartFiles);

    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].code, 'extra-table-in-db');
    assert.ok(issues[0].message.includes('legacy_archive'));
  });

  it('should NOT report when all DB tables have Dart definitions', () => {
    const dartFiles = [createDartFile('users', ['id', 'name'])];
    const dbTableMap = new Map<string, TableMetadata>([
      ['users', createDbTable('users')],
    ]);
    const issues: IDiagnosticIssue[] = [];

    checkExtraTablesInDb(issues, dbTableMap, dartFiles);

    assert.strictEqual(issues.length, 0);
  });

  it('should produce no issues when dartFiles is empty', () => {
    const dbTableMap = new Map<string, TableMetadata>([
      ['orphan', createDbTable('orphan')],
    ]);
    const issues: IDiagnosticIssue[] = [];

    checkExtraTablesInDb(issues, dbTableMap, []);

    assert.strictEqual(issues.length, 0);
  });

  it('should attach diagnostic to the file with the most table definitions', () => {
    // Root cause 3 fix: extra-table-in-db should target the "primary schema"
    // file (most tables), not an arbitrary first file
    const smallFile = createDartFile('users', ['id']);
    const bigFile: IDartFileInfo = {
      uri: Uri.parse('file:///lib/database/schema.dart') as any,
      text: 'class Orders extends Table {} class Products extends Table {}',
      tables: [
        {
          dartClassName: 'Orders',
          sqlTableName: 'orders',
          columns: [],
          indexes: [],
          uniqueKeys: [],
          fileUri: 'file:///lib/database/schema.dart',
          line: 0,
        },
        {
          dartClassName: 'Products',
          sqlTableName: 'products',
          columns: [],
          indexes: [],
          uniqueKeys: [],
          fileUri: 'file:///lib/database/schema.dart',
          line: 1,
        },
      ],
    };

    // Pass smallFile first so the old dartFiles[0] behavior would pick it
    const dartFiles = [smallFile, bigFile];
    const dbTableMap = new Map<string, TableMetadata>([
      ['users', createDbTable('users')],
      ['orders', createDbTable('orders')],
      ['products', createDbTable('products')],
      ['orphan_table', createDbTable('orphan_table')],
    ]);
    const issues: IDiagnosticIssue[] = [];

    checkExtraTablesInDb(issues, dbTableMap, dartFiles);

    // Should report one extra table (orphan_table)
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].code, 'extra-table-in-db');
    assert.ok(issues[0].message.includes('orphan_table'));

    // The diagnostic should be attached to bigFile (2 tables), not smallFile (1 table)
    const issueUri = (issues[0].fileUri as any).toString();
    assert.ok(
      issueUri.includes('schema.dart'),
      `Expected diagnostic on schema.dart (most tables), got: ${issueUri}`,
    );
  });
});
