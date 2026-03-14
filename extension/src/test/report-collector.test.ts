import * as assert from 'assert';
import * as sinon from 'sinon';
import { DriftApiClient } from '../api-client';
import { ReportCollector, parseSchemaStatements } from '../report/report-collector';

describe('parseSchemaStatements', () => {
  it('should extract CREATE TABLE for selected tables', () => {
    const dump = [
      'CREATE TABLE "users" (id INTEGER PRIMARY KEY, name TEXT);',
      'CREATE TABLE "orders" (id INTEGER PRIMARY KEY, user_id INTEGER);',
      'CREATE TABLE "logs" (id INTEGER PRIMARY KEY, msg TEXT);',
    ].join('\n');
    const result = parseSchemaStatements(dump, ['users', 'orders']);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].table, 'users');
    assert.strictEqual(result[1].table, 'orders');
  });

  it('should handle IF NOT EXISTS syntax', () => {
    const dump = 'CREATE TABLE IF NOT EXISTS "users" (id INTEGER PRIMARY KEY);';
    const result = parseSchemaStatements(dump, ['users']);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].table, 'users');
  });

  it('should handle unquoted table names', () => {
    const dump = 'CREATE TABLE users (id INTEGER PRIMARY KEY);';
    const result = parseSchemaStatements(dump, ['users']);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].table, 'users');
  });

  it('should return empty array for no matches', () => {
    const dump = 'CREATE TABLE "orders" (id INTEGER);';
    const result = parseSchemaStatements(dump, ['users']);
    assert.strictEqual(result.length, 0);
  });

  it('should handle empty dump string', () => {
    const result = parseSchemaStatements('', ['users']);
    assert.strictEqual(result.length, 0);
  });

  it('should preserve the full SQL statement', () => {
    const sql = 'CREATE TABLE "users" (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL\n)';
    const result = parseSchemaStatements(sql, ['users']);
    assert.strictEqual(result.length, 1);
    assert.ok(result[0].sql.includes('name TEXT NOT NULL'));
  });
});

describe('ReportCollector.collect', () => {
  let client: DriftApiClient;

  beforeEach(() => {
    client = new DriftApiClient('127.0.0.1', 8642);
  });

  afterEach(() => sinon.restore());

  it('should collect table data with correct row count', async () => {
    sinon.stub(client, 'schemaMetadata').resolves([
      {
        name: 'users',
        columns: [{ name: 'id', type: 'INTEGER', pk: true }],
        rowCount: 5,
      },
    ]);
    sinon.stub(client, 'sql').resolves({
      columns: ['id'],
      rows: [[1], [2], [3]],
    });

    const collector = new ReportCollector(client);
    const data = await collector.collect({
      tables: ['users'],
      maxRows: 1000,
      includeSchema: false,
      includeAnomalies: false,
    });

    assert.strictEqual(data.tables.length, 1);
    assert.strictEqual(data.tables[0].name, 'users');
    assert.strictEqual(data.tables[0].rows.length, 3);
    assert.strictEqual(data.tables[0].totalRowCount, 5);
    assert.strictEqual(data.tables[0].truncated, true);
  });

  it('should mark table as not truncated when all rows fetched', async () => {
    sinon.stub(client, 'schemaMetadata').resolves([
      {
        name: 'small',
        columns: [{ name: 'id', type: 'INTEGER', pk: true }],
        rowCount: 2,
      },
    ]);
    sinon.stub(client, 'sql').resolves({
      columns: ['id'],
      rows: [[1], [2]],
    });

    const collector = new ReportCollector(client);
    const data = await collector.collect({
      tables: ['small'],
      maxRows: 1000,
      includeSchema: false,
      includeAnomalies: false,
    });

    assert.strictEqual(data.tables[0].truncated, false);
  });

  it('should include schema when configured', async () => {
    sinon.stub(client, 'schemaMetadata').resolves([
      {
        name: 'users',
        columns: [{ name: 'id', type: 'INTEGER', pk: true }],
        rowCount: 0,
      },
    ]);
    sinon.stub(client, 'sql').resolves({ columns: ['id'], rows: [] });
    sinon.stub(client, 'schemaDump').resolves(
      'CREATE TABLE "users" (id INTEGER PRIMARY KEY);',
    );

    const collector = new ReportCollector(client);
    const data = await collector.collect({
      tables: ['users'],
      maxRows: 1000,
      includeSchema: true,
      includeAnomalies: false,
    });

    assert.ok(data.schema);
    assert.strictEqual(data.schema!.length, 1);
    assert.strictEqual(data.schema![0].table, 'users');
  });

  it('should include anomalies when configured', async () => {
    sinon.stub(client, 'schemaMetadata').resolves([
      {
        name: 'users',
        columns: [{ name: 'id', type: 'INTEGER', pk: true }],
        rowCount: 0,
      },
    ]);
    sinon.stub(client, 'sql').resolves({ columns: ['id'], rows: [] });
    sinon.stub(client, 'anomalies').resolves([
      { message: 'Orphaned FK', severity: 'warning' },
    ]);

    const collector = new ReportCollector(client);
    const data = await collector.collect({
      tables: ['users'],
      maxRows: 1000,
      includeSchema: false,
      includeAnomalies: true,
    });

    assert.ok(data.anomalies);
    assert.strictEqual(data.anomalies!.length, 1);
    assert.strictEqual(data.anomalies![0].message, 'Orphaned FK');
  });

  it('should skip schema and anomalies when not configured', async () => {
    sinon.stub(client, 'schemaMetadata').resolves([
      {
        name: 'users',
        columns: [{ name: 'id', type: 'INTEGER', pk: true }],
        rowCount: 0,
      },
    ]);
    sinon.stub(client, 'sql').resolves({ columns: ['id'], rows: [] });

    const collector = new ReportCollector(client);
    const data = await collector.collect({
      tables: ['users'],
      maxRows: 1000,
      includeSchema: false,
      includeAnomalies: false,
    });

    assert.strictEqual(data.schema, undefined);
    assert.strictEqual(data.anomalies, undefined);
  });

  it('should zip row arrays into keyed objects', async () => {
    sinon.stub(client, 'schemaMetadata').resolves([
      {
        name: 'users',
        columns: [
          { name: 'id', type: 'INTEGER', pk: true },
          { name: 'name', type: 'TEXT', pk: false },
        ],
        rowCount: 1,
      },
    ]);
    sinon.stub(client, 'sql').resolves({
      columns: ['id', 'name'],
      rows: [[1, 'Alice']],
    });

    const collector = new ReportCollector(client);
    const data = await collector.collect({
      tables: ['users'],
      maxRows: 1000,
      includeSchema: false,
      includeAnomalies: false,
    });

    assert.deepStrictEqual(data.tables[0].rows[0], { id: 1, name: 'Alice' });
  });

  it('should set serverUrl and generatedAt', async () => {
    sinon.stub(client, 'schemaMetadata').resolves([]);
    const collector = new ReportCollector(client);
    const data = await collector.collect({
      tables: [],
      maxRows: 1000,
      includeSchema: false,
      includeAnomalies: false,
    });

    assert.strictEqual(data.serverUrl, 'http://127.0.0.1:8642');
    assert.ok(data.generatedAt);
  });
});
