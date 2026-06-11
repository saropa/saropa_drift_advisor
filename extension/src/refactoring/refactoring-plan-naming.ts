/**
 * Naming, quoting, schema-lookup, and Dart/Drift code-generation helpers shared
 * by the migration-plan builders. All pure functions — no API client — so each
 * per-type plan module ([refactoring-plans-normalize-split],
 * [refactoring-plans-merge-extract]) can import from here freely.
 */

import type { ColumnMetadata, TableMetadata } from '../api-types';
import type { IMigrationStep } from './refactoring-types';

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Builds a Dart class name from a SQL table name. */
export function pascalCaseFromSqlTable(name: string): string {
  const parts = name.split(/[^a-zA-Z0-9]+/).filter((p) => p.length > 0);
  if (parts.length === 0) return 'Lookup';
  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join('');
}

export function lookupTableName(table: string, column: string): string {
  const raw = `${table}_${column}_lookup`.replace(/[^a-zA-Z0-9_]/g, '_');
  return raw.length > 60 ? raw.slice(0, 60) : raw;
}

export function sqlTypeForColumn(col: ColumnMetadata): string {
  const u = col.type.toUpperCase();
  if (u.includes('INT')) return 'INTEGER';
  if (u.includes('REAL') || u.includes('FLOA') || u.includes('DOUB')) return 'REAL';
  if (u.includes('BLOB')) return 'BLOB';
  return 'TEXT';
}

export function findTable(meta: TableMetadata[], name: string): TableMetadata | undefined {
  return meta.find((t) => t.name === name);
}

export function findSinglePkColumn(table: TableMetadata): ColumnMetadata | undefined {
  const pks = table.columns.filter((c) => c.pk);
  if (pks.length !== 1) return undefined;
  return pks[0];
}

export function suggestedMergeFkColumn(referencedTable: string, pkColumn: string): string {
  const base = `fk_${referencedTable}_${pkColumn}`.replace(/[^a-zA-Z0-9_]/g, '_');
  return base.length > 48 ? base.slice(0, 48) : base;
}

/** Deterministic shared-table name for an extracted column bundle. */
export function sharedExtractTableName(columns: string[]): string {
  const raw = `shared_${columns.join('_')}`.replace(/[^a-zA-Z0-9_]/g, '_');
  return raw.length > 60 ? raw.slice(0, 60) : raw;
}

/** Converts a snake_case SQL column name to a camelCase Dart getter name. */
export function camelCaseFromSqlColumn(name: string): string {
  const parts = name.split(/[^a-zA-Z0-9]+/).filter((p) => p.length > 0);
  if (parts.length === 0) return 'column';
  return parts
    .map((p, i) => (i === 0 ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()))
    .join('');
}

/** Renders a Drift column getter line for a mixin from a SQL type. */
export function driftColumnGetter(name: string, sqlType: string): string {
  const getter = camelCaseFromSqlColumn(name);
  switch (sqlType) {
    case 'INTEGER':
      return `  IntColumn get ${getter} => integer()();`;
    case 'REAL':
      return `  RealColumn get ${getter} => real()();`;
    case 'BLOB':
      return `  BlobColumn get ${getter} => blob()();`;
    default:
      return `  TextColumn get ${getter} => text()();`;
  }
}

/** Wraps each migration step's SQL into a Drift `onUpgrade` customStatement block. */
export function generateDartMigration(steps: IMigrationStep[]): string {
  const blocks = steps.map((s) => {
    const safe = s.sql.replace(/'''/g, "\\'\\'\\'");
    return `    // ${s.title}\n    await customStatement(r'''${safe}''');`;
  });
  return `onUpgrade: (m, from, to) async {\n${blocks.join('\n\n')}\n}`;
}
