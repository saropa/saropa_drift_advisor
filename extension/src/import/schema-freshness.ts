/**
 * Schema freshness checking.
 * Detects when table schema has changed since mapping was created.
 */

import type { ColumnMetadata } from '../api-types';
import type { ISchemaSnapshot } from './clipboard-import-types';

/**
 * Compute a version hash for a table schema.
 * Changes when columns are added, removed, or modified.
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
