/**
 * Shared test fixtures for health scorer and panel tests.
 */

import * as sinon from 'sinon';
import { DriftApiClient } from '../../api-client';

/** Create a DriftApiClient instance for tests (host/port are irrelevant when stubbed). */
export function makeClient(): DriftApiClient {
  return new DriftApiClient('127.0.0.1', 8642);
}

/** Stub all API methods to return a "perfect" database (PKs, no anomalies, no slow queries). */
export function stubPerfectDb(client: DriftApiClient): void {
  sinon.stub(client, 'schemaMetadata').resolves([
    {
      name: 'users',
      columns: [
        { name: 'id', type: 'INTEGER', pk: true },
        { name: 'name', type: 'TEXT', pk: false },
      ],
      rowCount: 10,
    },
    {
      name: 'orders',
      columns: [
        { name: 'id', type: 'INTEGER', pk: true },
        { name: 'user_id', type: 'INTEGER', pk: false },
      ],
      rowCount: 20,
    },
  ]);
  sinon.stub(client, 'tableFkMeta').resolves([]);
  sinon.stub(client, 'indexSuggestions').resolves([]);
  sinon.stub(client, 'anomalies').resolves([]);
  sinon.stub(client, 'sql').resolves({ columns: ['total'], rows: [[10, 0, 0]] });
  sinon.stub(client, 'performance').resolves({
    totalQueries: 50,
    totalDurationMs: 200,
    avgDurationMs: 4,
    slowQueries: [],
    recentQueries: [],
  });
  sinon.stub(client, 'sizeAnalytics').resolves({
    pageSize: 4096,
    pageCount: 10,
    totalSizeBytes: 40960,
    freeSpaceBytes: 0,
    usedSizeBytes: 40960,
    journalMode: 'wal',
    tableCount: 2,
    tables: [
      { table: 'users', rowCount: 10, columnCount: 2, indexCount: 0, indexes: [] },
      { table: 'orders', rowCount: 20, columnCount: 2, indexCount: 0, indexes: [] },
    ],
  });
}
