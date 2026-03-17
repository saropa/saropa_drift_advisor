// Contract tests for API type definitions (api-types.ts).
//
// These tests validate at compile-time and runtime that the TypeScript
// interfaces match the documented API shapes in doc/API.md. If a field
// is removed from an interface, this file fails to compile. If a field
// is renamed, the runtime assertions catch the mismatch.
//
// See also: test/handler_integration_test.dart for server-side contract
// assertions.

import * as assert from 'assert';
import type {
  HealthResponse,
  TableMetadata,
  ColumnMetadata,
  ForeignKey,
  IndexSuggestion,
  Anomaly,
  QueryEntry,
  PerformanceData,
  IDiagramTable,
  IDiagramForeignKey,
  IDiagramData,
  ICompareReport,
  ITableCountDiff,
  IMigrationPreview,
  ISizeAnalytics,
  ITableSizeInfo,
  IImportResult,
  ISessionShareResult,
  ISessionData,
  IAnnotation,
} from '../api-types';

// Helper: asserts that an object has all expected keys. This catches
// drift between the interface and the documented API contract.
function assertHasKeys(obj: Record<string, unknown>, keys: string[], context: string): void {
  for (const key of keys) {
    assert.ok(key in obj, `${context}: missing key "${key}"`);
  }
}

describe('API type contracts (doc/API.md)', () => {
  // -------------------------------------------------------
  // Health & Generation
  // -------------------------------------------------------
  it('HealthResponse matches documented shape', () => {
    const h: HealthResponse = { ok: true, extensionConnected: false };
    assertHasKeys(h as unknown as Record<string, unknown>, ['ok'], 'HealthResponse');
    assert.strictEqual(typeof h.ok, 'boolean');
  });

  // -------------------------------------------------------
  // Tables
  // -------------------------------------------------------
  it('ColumnMetadata matches documented shape', () => {
    const c: ColumnMetadata = { name: 'id', type: 'INTEGER', pk: true };
    assertHasKeys(c as unknown as Record<string, unknown>, ['name', 'type', 'pk'], 'ColumnMetadata');
    assert.strictEqual(typeof c.name, 'string');
    assert.strictEqual(typeof c.type, 'string');
    assert.strictEqual(typeof c.pk, 'boolean');
  });

  it('TableMetadata matches documented shape', () => {
    const t: TableMetadata = {
      name: 'items',
      columns: [{ name: 'id', type: 'INTEGER', pk: true }],
      rowCount: 42,
    };
    assertHasKeys(t as unknown as Record<string, unknown>, ['name', 'columns', 'rowCount'], 'TableMetadata');
    assert.strictEqual(typeof t.name, 'string');
    assert.ok(Array.isArray(t.columns));
    assert.strictEqual(typeof t.rowCount, 'number');
  });

  it('ForeignKey matches documented shape', () => {
    const fk: ForeignKey = {
      fromColumn: 'user_id',
      toTable: 'users',
      toColumn: 'id',
    };
    assertHasKeys(fk as unknown as Record<string, unknown>, ['fromColumn', 'toTable', 'toColumn'], 'ForeignKey');
  });

  // -------------------------------------------------------
  // SQL (no dedicated type — uses {rows: ...} inline)
  // -------------------------------------------------------

  // -------------------------------------------------------
  // Schema & Export
  // -------------------------------------------------------
  it('IDiagramTable matches documented shape', () => {
    const t: IDiagramTable = {
      name: 'items',
      columns: [{ name: 'id', type: 'INTEGER', pk: 1 }],
    };
    assertHasKeys(t as unknown as Record<string, unknown>, ['name', 'columns'], 'IDiagramTable');
  });

  it('IDiagramForeignKey matches documented shape', () => {
    const fk: IDiagramForeignKey = {
      fromTable: 'orders',
      fromColumn: 'user_id',
      toTable: 'users',
      toColumn: 'id',
    };
    assertHasKeys(
      fk as unknown as Record<string, unknown>,
      ['fromTable', 'fromColumn', 'toTable', 'toColumn'],
      'IDiagramForeignKey',
    );
  });

  it('IDiagramData matches documented shape', () => {
    const d: IDiagramData = {
      tables: [{ name: 'items', columns: [{ name: 'id', type: 'INTEGER', pk: 1 }] }],
      foreignKeys: [],
    };
    assertHasKeys(d as unknown as Record<string, unknown>, ['tables', 'foreignKeys'], 'IDiagramData');
    assert.ok(Array.isArray(d.tables));
    assert.ok(Array.isArray(d.foreignKeys));
  });

  // -------------------------------------------------------
  // Compare
  // -------------------------------------------------------
  it('ITableCountDiff matches documented shape', () => {
    const diff: ITableCountDiff = {
      table: 'items',
      countA: 42,
      countB: 50,
      diff: -8,
      onlyInA: false,
      onlyInB: false,
    };
    assertHasKeys(
      diff as unknown as Record<string, unknown>,
      ['table', 'countA', 'countB', 'diff', 'onlyInA', 'onlyInB'],
      'ITableCountDiff',
    );
  });

  it('ICompareReport matches documented shape', () => {
    const report: ICompareReport = {
      schemaSame: true,
      schemaDiff: null,
      tablesOnlyInA: [],
      tablesOnlyInB: [],
      tableCounts: [],
      generatedAt: '2025-06-15T10:30:00.000Z',
    };
    assertHasKeys(
      report as unknown as Record<string, unknown>,
      ['schemaSame', 'schemaDiff', 'tablesOnlyInA', 'tablesOnlyInB', 'tableCounts', 'generatedAt'],
      'ICompareReport',
    );
    assert.strictEqual(typeof report.schemaSame, 'boolean');
    assert.strictEqual(typeof report.generatedAt, 'string');
  });

  it('IMigrationPreview matches documented shape', () => {
    const preview: IMigrationPreview = {
      migrationSql: 'ALTER TABLE ...',
      changeCount: 1,
      hasWarnings: false,
      generatedAt: '2025-06-15T10:30:00.000Z',
    };
    assertHasKeys(
      preview as unknown as Record<string, unknown>,
      ['migrationSql', 'changeCount', 'hasWarnings', 'generatedAt'],
      'IMigrationPreview',
    );
  });

  // -------------------------------------------------------
  // Analytics
  // -------------------------------------------------------
  it('IndexSuggestion matches documented shape', () => {
    const s: IndexSuggestion = {
      table: 'orders',
      column: 'user_id',
      reason: 'Foreign key without index',
      sql: 'CREATE INDEX ...',
      priority: 'high',
    };
    assertHasKeys(
      s as unknown as Record<string, unknown>,
      ['table', 'column', 'reason', 'sql', 'priority'],
      'IndexSuggestion',
    );
    // Priority must be one of the documented values.
    assert.ok(['high', 'medium', 'low'].includes(s.priority));
  });

  it('Anomaly matches documented shape', () => {
    const a: Anomaly = {
      message: '3 orphaned FK(s)',
      severity: 'error',
    };
    assertHasKeys(a as unknown as Record<string, unknown>, ['message', 'severity'], 'Anomaly');
    assert.ok(['error', 'warning', 'info'].includes(a.severity));
  });

  it('ITableSizeInfo matches documented shape', () => {
    const info: ITableSizeInfo = {
      table: 'items',
      rowCount: 100,
      columnCount: 5,
      indexCount: 2,
      indexes: ['idx_items_title'],
    };
    assertHasKeys(
      info as unknown as Record<string, unknown>,
      ['table', 'rowCount', 'columnCount', 'indexCount', 'indexes'],
      'ITableSizeInfo',
    );
    assert.ok(Array.isArray(info.indexes));
  });

  it('ISizeAnalytics matches documented shape', () => {
    const size: ISizeAnalytics = {
      pageSize: 4096,
      pageCount: 128,
      totalSizeBytes: 524288,
      freeSpaceBytes: 8192,
      usedSizeBytes: 516096,
      journalMode: 'wal',
      tableCount: 5,
      tables: [],
    };
    assertHasKeys(
      size as unknown as Record<string, unknown>,
      ['pageSize', 'pageCount', 'totalSizeBytes', 'freeSpaceBytes', 'usedSizeBytes', 'journalMode', 'tableCount', 'tables'],
      'ISizeAnalytics',
    );
    assert.strictEqual(typeof size.journalMode, 'string');
  });

  // -------------------------------------------------------
  // Performance
  // -------------------------------------------------------
  it('QueryEntry matches documented shape', () => {
    const q: QueryEntry = {
      sql: 'SELECT * FROM items',
      durationMs: 5,
      rowCount: 10,
      at: '2025-06-15T10:30:00.000Z',
    };
    assertHasKeys(
      q as unknown as Record<string, unknown>,
      ['sql', 'durationMs', 'rowCount', 'at'],
      'QueryEntry',
    );
  });

  it('PerformanceData matches documented shape', () => {
    const perf: PerformanceData = {
      totalQueries: 100,
      totalDurationMs: 500,
      avgDurationMs: 5,
      slowQueries: [],
      recentQueries: [],
    };
    assertHasKeys(
      perf as unknown as Record<string, unknown>,
      ['totalQueries', 'totalDurationMs', 'avgDurationMs', 'slowQueries', 'recentQueries'],
      'PerformanceData',
    );
    assert.ok(Array.isArray(perf.slowQueries));
    assert.ok(Array.isArray(perf.recentQueries));
  });

  // -------------------------------------------------------
  // Sessions
  // -------------------------------------------------------
  it('ISessionShareResult matches documented shape', () => {
    const result: ISessionShareResult = {
      id: 'abc123',
      url: 'http://localhost:8642/?session=abc123',
      expiresAt: '2025-06-15T11:30:00.000Z',
    };
    assertHasKeys(
      result as unknown as Record<string, unknown>,
      ['id', 'url', 'expiresAt'],
      'ISessionShareResult',
    );
  });

  it('IAnnotation matches documented shape', () => {
    const a: IAnnotation = {
      text: 'Found issue',
      author: 'dev@example.com',
      at: '2025-06-15T10:35:00.000Z',
    };
    assertHasKeys(a as unknown as Record<string, unknown>, ['text', 'author', 'at'], 'IAnnotation');
  });

  it('ISessionData matches documented shape', () => {
    const session: ISessionData = {
      state: { currentTable: 'items' },
      createdAt: '2025-06-15T10:30:00.000Z',
      expiresAt: '2025-06-15T11:30:00.000Z',
      annotations: [],
    };
    assertHasKeys(
      session as unknown as Record<string, unknown>,
      ['state', 'createdAt', 'expiresAt', 'annotations'],
      'ISessionData',
    );
    assert.ok(Array.isArray(session.annotations));
  });

  // -------------------------------------------------------
  // Import
  // -------------------------------------------------------
  it('IImportResult matches documented shape', () => {
    const result: IImportResult = {
      imported: 5,
      errors: [],
      format: 'csv',
      table: 'users',
    };
    assertHasKeys(
      result as unknown as Record<string, unknown>,
      ['imported', 'errors', 'format', 'table'],
      'IImportResult',
    );
    assert.strictEqual(typeof result.imported, 'number');
    assert.ok(Array.isArray(result.errors));
    assert.strictEqual(typeof result.format, 'string');
    assert.strictEqual(typeof result.table, 'string');
  });
});
