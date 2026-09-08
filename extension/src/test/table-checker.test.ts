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
import type { IDartFileInfo } from '../diagnostics/diagnostic-context-types';
import type { IDiagnosticIssue } from '../diagnostics/diagnostic-issue-types';
import { emptySuppressions } from '../diagnostics/suppression';
import type { TableMetadata } from '../api-types';
import { createDartFile } from './diagnostic-test-helpers';
import {
  checkExtraTablesInDb,
  checkMissingTableInDb,
  isEngineOwnedTable,
  isFtsShadowTable,
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
      suppressions: emptySuppressions(),
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

describe('isFtsShadowTable', () => {
  it('should detect FTS5 shadow tables when parent virtual table exists', () => {
    // FTS5 creates five shadow tables: _data, _idx, _content, _docsize, _config.
    // Each should be recognized when the parent "notes_fts" is a known table.
    const allTables = new Set([
      'notes', 'notes_fts', 'notes_fts_data', 'notes_fts_idx',
      'notes_fts_content', 'notes_fts_docsize', 'notes_fts_config',
    ]);

    assert.strictEqual(isFtsShadowTable('notes_fts_data', allTables), true);
    assert.strictEqual(isFtsShadowTable('notes_fts_idx', allTables), true);
    assert.strictEqual(isFtsShadowTable('notes_fts_content', allTables), true);
    assert.strictEqual(isFtsShadowTable('notes_fts_docsize', allTables), true);
    assert.strictEqual(isFtsShadowTable('notes_fts_config', allTables), true);
  });

  it('should detect FTS3/FTS4 shadow tables when parent virtual table exists', () => {
    // FTS3/FTS4 use different suffixes: _content, _segments, _segdir, _stat.
    const allTables = new Set([
      'docs', 'docs_fts', 'docs_fts_content', 'docs_fts_segments',
      'docs_fts_segdir', 'docs_fts_stat',
    ]);

    assert.strictEqual(isFtsShadowTable('docs_fts_content', allTables), true);
    assert.strictEqual(isFtsShadowTable('docs_fts_segments', allTables), true);
    assert.strictEqual(isFtsShadowTable('docs_fts_segdir', allTables), true);
    assert.strictEqual(isFtsShadowTable('docs_fts_stat', allTables), true);
  });

  it('should NOT detect shadow table when parent virtual table is absent', () => {
    // If "notes_fts" isn't in the DB, "notes_fts_data" is just a normal table
    // that happens to end in "_data" — not a shadow table.
    const allTables = new Set(['notes', 'notes_fts_data']);

    assert.strictEqual(isFtsShadowTable('notes_fts_data', allTables), false);
  });

  it('should NOT flag the parent virtual table itself', () => {
    // "notes_fts" is the virtual table, not a shadow table —
    // it should not match any shadow suffix.
    const allTables = new Set(['notes_fts', 'notes_fts_data']);

    assert.strictEqual(isFtsShadowTable('notes_fts', allTables), false);
  });

  it('should NOT flag ordinary user tables that happen to end with a suffix', () => {
    // "audit_data" ends in "_data" but "audit" is not a DB table,
    // so this is a genuine user table, not a shadow.
    const allTables = new Set(['audit_data', 'users']);

    assert.strictEqual(isFtsShadowTable('audit_data', allTables), false);
  });

  it('should NOT flag a legitimate user table whose prefix is also a table', () => {
    // "user_data" ends in "_data" and "user" exists, but there are no other
    // FTS shadow siblings (_idx, _content, etc.). A single suffix match is
    // ambiguous — `_data` is a common naming convention for regular tables.
    // Without the sibling check this was a critical false positive.
    const allTables = new Set(['user', 'user_data', 'orders']);

    assert.strictEqual(isFtsShadowTable('user_data', allTables), false);
  });

  it('should NOT flag when only 2 shadow siblings exist (below threshold)', () => {
    // Two siblings is not enough — real FTS tables create 4-5. Two could
    // be coincidence (e.g. session_data + session_config + session table).
    const allTables = new Set([
      'session', 'session_data', 'session_config', 'users',
    ]);

    assert.strictEqual(isFtsShadowTable('session_data', allTables), false);
  });
});

describe('isEngineOwnedTable', () => {
  it('should recognize android_metadata as engine-owned', () => {
    // Android's platform SQLite wrapper creates this table automatically;
    // users never declare it in Dart.
    const allTables = new Set(['users', 'android_metadata']);

    assert.strictEqual(isEngineOwnedTable('android_metadata', allTables), true);
  });

  it('should recognize FTS5 shadow tables as engine-owned', () => {
    // Combines the FTS detection with the engine-owned umbrella check.
    // Requires the full FTS5 shadow set (3+ siblings) to confirm — a lone
    // `_data` with only the parent would be ambiguous.
    const allTables = new Set([
      'notes_fts', 'notes_fts_data', 'notes_fts_idx',
      'notes_fts_content', 'notes_fts_docsize', 'notes_fts_config',
    ]);

    assert.strictEqual(isEngineOwnedTable('notes_fts_data', allTables), true);
  });

  it('should NOT flag regular user tables as engine-owned', () => {
    const allTables = new Set(['users', 'orders', 'products']);

    assert.strictEqual(isEngineOwnedTable('users', allTables), false);
    assert.strictEqual(isEngineOwnedTable('orders', allTables), false);
  });
});

describe('checkExtraTablesInDb with FTS5 shadow tables', () => {
  it('should NOT report FTS5 shadow tables as extra (integration via SchemaProvider filtering)', () => {
    // This tests the end-to-end scenario from the bug report:
    // A DB has notes, notes_fts (virtual), and five FTS5 shadow tables.
    // Only notes_fts should be flagged as extra — the shadow tables must
    // be filtered out by SchemaProvider before reaching checkExtraTablesInDb.
    //
    // NOTE: The actual filtering happens in SchemaProvider, not in
    // checkExtraTablesInDb. This test verifies that if shadow tables are
    // properly excluded from dbTableMap, zero false positives result.
    const dartFiles = [createDartFile('notes', ['id', 'body'])];

    // dbTableMap as it would look AFTER SchemaProvider's engine-owned filter:
    // only the parent virtual table remains (shadow tables removed).
    const dbTableMap = new Map<string, TableMetadata>([
      ['notes', createDbTable('notes')],
      ['notes_fts', createDbTable('notes_fts')],
    ]);
    const issues: IDiagnosticIssue[] = [];

    checkExtraTablesInDb(issues, dbTableMap, dartFiles);

    // notes_fts (the virtual table itself) IS extra — user may want to declare it.
    // But the five shadow tables should NOT appear because they were filtered out.
    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].code, 'extra-table-in-db');
    assert.ok(issues[0].message.includes('notes_fts'));
  });

  it('should still report genuinely extra tables alongside FTS5 tables', () => {
    // Verify that real extra tables still fire even when shadow tables
    // are present (after filtering).
    const dartFiles = [createDartFile('notes', ['id', 'body'])];

    // After filtering: shadow tables removed, but legacy_archive remains
    const dbTableMap = new Map<string, TableMetadata>([
      ['notes', createDbTable('notes')],
      ['notes_fts', createDbTable('notes_fts')],
      ['legacy_archive', createDbTable('legacy_archive')],
    ]);
    const issues: IDiagnosticIssue[] = [];

    checkExtraTablesInDb(issues, dbTableMap, dartFiles);

    // Two extra tables: notes_fts and legacy_archive
    assert.strictEqual(issues.length, 2);
    const codes = issues.map((i) => i.code);
    assert.ok(codes.every((c) => c === 'extra-table-in-db'));
    const messages = issues.map((i) => i.message);
    assert.ok(messages.some((m) => m.includes('notes_fts')));
    assert.ok(messages.some((m) => m.includes('legacy_archive')));
  });
});
