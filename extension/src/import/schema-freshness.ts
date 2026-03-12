/**
 * Schema freshness checking for clipboard imports.
 *
 * This module provides functionality to detect when a table's schema
 * has changed between when the import was set up (columns mapped) and
 * when the import is actually executed. This prevents data corruption
 * from importing to columns that no longer exist or have changed type.
 *
 * The workflow:
 * 1. Capture schema snapshot when import panel opens
 * 2. Before executing import, check current schema against snapshot
 * 3. If schema changed, warn user about specific changes
 * 4. User can choose to proceed or cancel
 *
 * @module schema-freshness
 */

import type { ColumnMetadata } from '../api-types';
import type { ISchemaSnapshot } from './clipboard-import-types';

/**
 * Compute a version hash for a table schema.
 *
 * Creates a deterministic hash from column definitions that changes
 * when columns are added, removed, or modified. Used for quick
 * comparison before doing detailed diff.
 *
 * Hash is computed from sorted column definitions to be order-independent.
 * Format per column: "name:type:notnull:pk"
 *
 * @param columns - Table column metadata
 * @returns 8-character hex hash string
 */
export function computeSchemaVersion(columns: ColumnMetadata[]): string {
  const structure = columns
    .map((c) => `${c.name}:${c.type}:${c.notnull ?? false}:${c.pk}`)
    .sort()
    .join('|');

  let hash = 0;
  for (let i = 0; i < structure.length; i++) {
    const char = structure.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Create a schema snapshot for a table.
 *
 * Captures the current state of table columns for later comparison.
 * Called when the import panel opens to establish baseline.
 *
 * @param table - Table name
 * @param columns - Current column metadata
 * @returns Snapshot with column info, version hash, and timestamp
 */
export function captureSchemaSnapshot(
  table: string,
  columns: ColumnMetadata[],
): ISchemaSnapshot {
  return {
    table,
    columns: columns.map((c) => ({
      name: c.name,
      type: c.type,
      nullable: !c.notnull,
    })),
    version: computeSchemaVersion(columns),
    capturedAt: new Date(),
  };
}

/**
 * Check if schema has changed since snapshot was captured.
 *
 * First does a quick version hash comparison. If hashes differ,
 * performs detailed diff to identify specific changes:
 * - Columns removed from table
 * - Columns added to table
 * - Column type changes
 * - Nullability changes
 *
 * @param snapshot - Previously captured schema snapshot
 * @param currentColumns - Current table columns
 * @returns Whether schema is fresh and list of human-readable changes
 */
export function checkSchemaFreshness(
  snapshot: ISchemaSnapshot,
  currentColumns: ColumnMetadata[],
): { fresh: boolean; changes: string[] } {
  const currentVersion = computeSchemaVersion(currentColumns);

  if (currentVersion === snapshot.version) {
    return { fresh: true, changes: [] };
  }

  const changes: string[] = [];
  const snapshotColMap = new Map(snapshot.columns.map((c) => [c.name, c]));
  const currentColMap = new Map(currentColumns.map((c) => [c.name, c]));

  for (const col of snapshot.columns) {
    const current = currentColMap.get(col.name);
    if (!current) {
      changes.push(`Column "${col.name}" was removed`);
    } else {
      if (current.type !== col.type) {
        changes.push(`Column "${col.name}" type changed: ${col.type} → ${current.type}`);
      }
      if ((!current.notnull) !== col.nullable) {
        const wasNullable = col.nullable ? 'nullable' : 'not null';
        const isNullable = !current.notnull ? 'nullable' : 'not null';
        changes.push(`Column "${col.name}" changed from ${wasNullable} to ${isNullable}`);
      }
    }
  }

  for (const col of currentColumns) {
    if (!snapshotColMap.has(col.name)) {
      changes.push(`Column "${col.name}" was added`);
    }
  }

  return { fresh: false, changes };
}

/**
 * Get elapsed time since snapshot was captured in human-readable format.
 *
 * Formats elapsed time with appropriate units:
 * - Seconds (< 1 minute): "45s ago"
 * - Minutes (< 1 hour): "15m ago"
 * - Hours (< 1 day): "3h ago"
 * - Days: "2d ago"
 *
 * @param snapshot - Schema snapshot to check age of
 * @returns Human-readable age string
 */
export function getSnapshotAge(snapshot: ISchemaSnapshot): string {
  const now = new Date();
  const elapsed = now.getTime() - snapshot.capturedAt.getTime();

  const seconds = Math.floor(elapsed / 1000);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
