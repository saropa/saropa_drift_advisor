/**
 * Shared test helpers for sampling-engine tests.
 */

import type { TableMetadata } from '../api-types';

export function makeMeta(overrides: Partial<TableMetadata> = {}): TableMetadata {
  return {
    name: 'orders',
    columns: [
      { name: 'id', type: 'INTEGER', pk: true },
      { name: 'total', type: 'REAL', pk: false },
      { name: 'status', type: 'TEXT', pk: false },
    ],
    rowCount: 100,
    ...overrides,
  };
}
