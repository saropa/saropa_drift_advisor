/**
 * Tests for HealthScorer.compute (metric scoring and recommendations).
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import { DriftApiClient } from '../api-client';
import { HealthScorer } from '../health/health-scorer';
import { REFACTORING_ADVISOR_SESSION_KEY } from '../refactoring/refactoring-advisor-state';
import { makeClient, stubPerfectDb } from './fixtures/health-test-fixtures';
import { MockMemento } from './vscode-mock';

describe('HealthScorer.compute', () => {
  let client: DriftApiClient;

  beforeEach(() => {
    client = makeClient();
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should give perfect database a high score', async () => {
    stubPerfectDb(client);
    const scorer = new HealthScorer();
    const result = await scorer.compute(client);

    assert.strictEqual(result.metrics.length, 6);
    assert.ok(result.overall >= 90, `Expected >= 90, got ${result.overall}`);
    assert.ok(result.grade.startsWith('A'), `Expected A grade, got ${result.grade}`);
  });

  it('should return 6 metrics with expected keys', async () => {
    stubPerfectDb(client);
    const scorer = new HealthScorer();
    const result = await scorer.compute(client);

    const keys = result.metrics.map((m) => m.key).sort();
    assert.deepStrictEqual(keys, [
      'fkIntegrity',
      'indexCoverage',
      'nullDensity',
      'queryPerformance',
      'schemaQuality',
      'tableBalance',
    ]);
  });

  it('should drop indexCoverage score when suggestions exist', async () => {
    stubPerfectDb(client);
    (client.tableFkMeta as sinon.SinonStub).resolves([
      { fromColumn: 'user_id', toTable: 'users', toColumn: 'id' },
    ]);
    (client.indexSuggestions as sinon.SinonStub).resolves([
      { table: 'orders', column: 'user_id', reason: 'FK without index', sql: 'CREATE INDEX ...', priority: 'high' as const },
    ]);

    const scorer = new HealthScorer();
    const result = await scorer.compute(client);

    const indexMetric = result.metrics.find((m) => m.key === 'indexCoverage')!;
    assert.ok(indexMetric.score < 100, `Expected < 100, got ${indexMetric.score}`);
    assert.ok(indexMetric.details.length > 0);
  });

  it('should drop fkIntegrity score when error anomalies exist', async () => {
    stubPerfectDb(client);
    (client.anomalies as sinon.SinonStub).resolves([
      { message: 'orphan in orders.user_id', severity: 'error' },
      { message: 'orphan in orders.product_id', severity: 'error' },
      { message: 'nullable column warning', severity: 'warning' },
    ]);

    const scorer = new HealthScorer();
    const result = await scorer.compute(client);

    const fkMetric = result.metrics.find((m) => m.key === 'fkIntegrity')!;
    assert.strictEqual(fkMetric.score, 80);
    assert.strictEqual(fkMetric.details.length, 2);
  });

  it('should drop nullDensity score for high null percentage', async () => {
    stubPerfectDb(client);
    (client.sql as sinon.SinonStub).resolves({
      columns: ['total', 'nulls_col1', 'nulls_col2'],
      rows: [[10, 5, 5]],
    });

    const scorer = new HealthScorer();
    const result = await scorer.compute(client);

    const nullMetric = result.metrics.find((m) => m.key === 'nullDensity')!;
    assert.ok(nullMetric.score < 50, `Expected < 50, got ${nullMetric.score}`);
  });

  it('should drop queryPerformance score when slow queries exist', async () => {
    stubPerfectDb(client);
    (client.performance as sinon.SinonStub).resolves({
      totalQueries: 10,
      totalDurationMs: 5000,
      avgDurationMs: 500,
      slowQueries: [
        { sql: 'SELECT * FROM big_table', durationMs: 1500, rowCount: 10000, at: '2024-01-01' },
        { sql: 'SELECT * FROM big_table2', durationMs: 2000, rowCount: 5000, at: '2024-01-01' },
        { sql: 'SELECT * FROM big_table3', durationMs: 1000, rowCount: 3000, at: '2024-01-01' },
      ],
      recentQueries: [],
    });

    const scorer = new HealthScorer();
    const result = await scorer.compute(client);

    const perfMetric = result.metrics.find((m) => m.key === 'queryPerformance')!;
    assert.strictEqual(perfMetric.score, 70);
    assert.ok(perfMetric.details.length <= 5);
  });

  it('should drop tableBalance score when one table dominates', async () => {
    stubPerfectDb(client);
    (client.sizeAnalytics as sinon.SinonStub).resolves({
      pageSize: 4096,
      pageCount: 100,
      totalSizeBytes: 409600,
      freeSpaceBytes: 0,
      usedSizeBytes: 409600,
      journalMode: 'wal',
      tableCount: 2,
      tables: [
        { table: 'audit_log', rowCount: 9000, columnCount: 5, indexCount: 1, indexes: ['idx_1'] },
        { table: 'users', rowCount: 1000, columnCount: 3, indexCount: 0, indexes: [] },
      ],
    });

    const scorer = new HealthScorer();
    const result = await scorer.compute(client);

    const balanceMetric = result.metrics.find((m) => m.key === 'tableBalance')!;
    assert.ok(balanceMetric.score < 50, `Expected < 50, got ${balanceMetric.score}`);
    assert.ok(balanceMetric.details.length > 0);
  });

  it('should merge persisted refactoring advisor session into schema quality details', async () => {
    stubPerfectDb(client);
    const ws = new MockMemento();
    await ws.update(REFACTORING_ADVISOR_SESSION_KEY, {
      updatedAt: new Date().toISOString(),
      tableCount: 5,
      suggestionCount: 2,
      dismissedCount: 1,
      topTitles: ['Normalize status enum', 'Add index on foo'],
    });

    const scorer = new HealthScorer();
    const result = await scorer.compute(client, ws);

    const schemaMetric = result.metrics.find((m) => m.key === 'schemaQuality')!;
    assert.ok(
      schemaMetric.details.some((d) => d.includes('Refactoring advisor: 2 suggestion')),
      'Expected advisor summary line in schema quality details',
    );
    assert.ok(
      schemaMetric.details.some((d) => d.includes('dismissed in the panel')),
      'Expected dismissed-count line when session has dismissals',
    );
    assert.ok(
      schemaMetric.details.some((d) => d.includes('Refactoring hint: Normalize status enum')),
      'Expected top suggestion title merged as hint line',
    );
    const action = schemaMetric.actions?.find((a) => a.command === 'driftViewer.suggestSchemaRefactorings');
    assert.ok(action, 'Expected refactoring action on schema quality when session exists');
  });

  it('should drop schemaQuality score when tables lack primary keys', async () => {
    stubPerfectDb(client);
    (client.schemaMetadata as sinon.SinonStub).resolves([
      {
        name: 'users',
        columns: [
          { name: 'id', type: 'INTEGER', pk: true },
          { name: 'name', type: 'TEXT', pk: false },
        ],
        rowCount: 10,
      },
      {
        name: 'logs',
        columns: [
          { name: 'message', type: 'TEXT', pk: false },
          { name: 'level', type: 'TEXT', pk: false },
        ],
        rowCount: 100,
      },
    ]);

    const scorer = new HealthScorer();
    const result = await scorer.compute(client);

    const schemaMetric = result.metrics.find((m) => m.key === 'schemaQuality')!;
    assert.strictEqual(schemaMetric.score, 50);
    assert.ok(schemaMetric.details.some((d) => d.includes('logs')));
  });

  it('should sort recommendations by severity (errors first)', async () => {
    stubPerfectDb(client);
    (client.indexSuggestions as sinon.SinonStub).resolves([
      { table: 'orders', column: 'user_id', reason: 'FK', sql: 'CREATE INDEX ...', priority: 'high' as const },
    ]);
    (client.tableFkMeta as sinon.SinonStub).resolves([
      { fromColumn: 'user_id', toTable: 'users', toColumn: 'id' },
    ]);
    (client.anomalies as sinon.SinonStub).resolves([
      { message: 'orphan 1', severity: 'error' },
      { message: 'orphan 2', severity: 'error' },
      { message: 'orphan 3', severity: 'error' },
      { message: 'orphan 4', severity: 'error' },
      { message: 'orphan 5', severity: 'error' },
      { message: 'orphan 6', severity: 'error' },
    ]);

    const scorer = new HealthScorer();
    const result = await scorer.compute(client);

    if (result.recommendations.length > 1) {
      for (let i = 1; i < result.recommendations.length; i++) {
        const order = { error: 0, warning: 1, info: 2 };
        const prev = order[result.recommendations[i - 1].severity];
        const curr = order[result.recommendations[i].severity];
        assert.ok(prev <= curr, `Recommendation ${i} out of order`);
      }
    }
  });

  it('should handle empty database gracefully', async () => {
    sinon.stub(client, 'schemaMetadata').resolves([]);
    sinon.stub(client, 'tableFkMeta').resolves([]);
    sinon.stub(client, 'indexSuggestions').resolves([]);
    sinon.stub(client, 'anomalies').resolves([]);
    sinon.stub(client, 'sql').resolves({ columns: [], rows: [] });
    sinon.stub(client, 'performance').resolves({
      totalQueries: 0,
      totalDurationMs: 0,
      avgDurationMs: 0,
      slowQueries: [],
      recentQueries: [],
    });
    sinon.stub(client, 'sizeAnalytics').resolves({
      pageSize: 4096,
      pageCount: 1,
      totalSizeBytes: 4096,
      freeSpaceBytes: 4096,
      usedSizeBytes: 0,
      journalMode: 'wal',
      tableCount: 0,
      tables: [],
    });

    const scorer = new HealthScorer();
    const result = await scorer.compute(client);

    assert.strictEqual(result.overall, 100);
    assert.strictEqual(result.grade, 'A+');
    assert.strictEqual(result.recommendations.length, 0);
  });

  it('should skip sqlite_ internal tables', async () => {
    sinon.stub(client, 'schemaMetadata').resolves([
      {
        name: 'sqlite_sequence',
        columns: [
          { name: 'name', type: 'TEXT', pk: false },
          { name: 'seq', type: 'INTEGER', pk: false },
        ],
        rowCount: 5,
      },
      {
        name: 'users',
        columns: [
          { name: 'id', type: 'INTEGER', pk: true },
        ],
        rowCount: 10,
      },
    ]);
    sinon.stub(client, 'tableFkMeta').resolves([]);
    sinon.stub(client, 'indexSuggestions').resolves([]);
    sinon.stub(client, 'anomalies').resolves([]);
    sinon.stub(client, 'sql').resolves({ columns: ['total', 'nulls'], rows: [[10, 0]] });
    sinon.stub(client, 'performance').resolves({
      totalQueries: 0,
      totalDurationMs: 0,
      avgDurationMs: 0,
      slowQueries: [],
      recentQueries: [],
    });
    sinon.stub(client, 'sizeAnalytics').resolves({
      pageSize: 4096,
      pageCount: 1,
      totalSizeBytes: 4096,
      freeSpaceBytes: 0,
      usedSizeBytes: 4096,
      journalMode: 'wal',
      tableCount: 1,
      tables: [
        { table: 'users', rowCount: 10, columnCount: 1, indexCount: 0, indexes: [] },
      ],
    });

    const scorer = new HealthScorer();
    const result = await scorer.compute(client);

    const schemaMetric = result.metrics.find((m) => m.key === 'schemaQuality')!;
    assert.strictEqual(schemaMetric.score, 100);
  });
});
