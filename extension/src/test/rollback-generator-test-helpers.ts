/**
 * Shared test helpers for rollback generator tests.
 */

import type { ISchemaSnapshot } from '../schema-timeline/schema-timeline-types';

/** Create a schema snapshot with sensible defaults. */
export function snap(
  generation: number,
  tables: ISchemaSnapshot['tables'] = [],
  _timestamp = '2026-01-01T00:00:00.000Z',
): ISchemaSnapshot {
  return { generation, timestamp: _timestamp, tables };
}

/** Create a column definition for use in snapshots. */
export function col(name: string, type = 'TEXT', pk = false) {
  return { name, type, pk };
}
