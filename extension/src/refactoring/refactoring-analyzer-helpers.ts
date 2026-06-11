/**
 * Shared constants, column-family knowledge, and small pure helpers for the
 * refactoring detectors (Feature 66). Kept dependency-light (no API client) so
 * both the schema-only and SQL-probing detector modules can import from here
 * without an import cycle through [refactoring-analyzer].
 */

import type { MigrationRisk, RefactoringSeverity } from './refactoring-types';

/** Minimum populated rows before normalization heuristics apply. */
export const NORMALIZE_MIN_ROWS = 50;
/** Maximum distinct text values to still consider a normalization candidate. */
export const NORMALIZE_MAX_DISTINCT = 20;
/** Distinct/total ratio must stay below this for normalization. */
export const NORMALIZE_MAX_RATIO = 0.1;
/** Confidence cutoff after scoring (matches Feature 66 plan). */
export const CONFIDENCE_THRESHOLD = 0.5;
/** Column count above which a "wide table" split hint is emitted. */
export const WIDE_TABLE_MIN_COLUMNS = 13;
/** Stronger split confidence when very wide. */
export const WIDE_TABLE_STRONG_COLUMNS = 21;
/** Do not run pairwise merge probes beyond this table count (keeps analysis bounded). */
export const MERGE_MAX_TABLES = 40;
/** Cap overlap subquery rows so accidental cartesian products stay bounded. */
export const MERGE_OVERLAP_SUBQUERY_LIMIT = 10_001;
/** Minimum overlapping rows to emit a merge hint (reduces accidental string matches). */
export const MERGE_MIN_OVERLAP = 5;
/** Skip merge overlap SQL when either table exceeds this row count. */
export const MERGE_MAX_ROWCOUNT_PER_TABLE = 50_000;
/** Minimum distinct tables a column must appear in to count toward an extract bundle. */
export const EXTRACT_MIN_TABLES = 2;
/** Minimum columns in a recurring bundle before suggesting extraction. */
export const EXTRACT_MIN_GROUP_COLUMNS = 2;
/** Confidence for a bundle matching a known column family (audit/address/etc.). */
export const EXTRACT_FAMILY_CONFIDENCE = 0.8;
/** Confidence for a generic bundle (no known family, but identical table set). */
export const EXTRACT_GENERIC_CONFIDENCE = 0.62;

/**
 * Known column families recognized by the extract detector. Names are matched
 * case-insensitively; `prefixes` catch convention-named blocks (e.g. `addr_*`).
 * Families let detection tolerate ragged table sets (audit/address columns
 * rarely appear in an identical set of tables), unlike the generic pass.
 */
export interface IColumnFamily {
  id: string;
  label: string;
  names: ReadonlySet<string>;
  prefixes?: readonly string[];
}

export const EXTRACT_FAMILIES: readonly IColumnFamily[] = [
  {
    id: 'audit',
    label: 'audit/timestamp',
    names: new Set([
      'created_at', 'updated_at', 'modified_at', 'inserted_at',
      'created_on', 'updated_on', 'created_by', 'updated_by', 'modified_by',
    ]),
  },
  {
    id: 'soft-delete',
    label: 'soft-delete',
    names: new Set(['deleted_at', 'is_deleted', 'deleted', 'deleted_by', 'archived_at', 'is_archived']),
  },
  {
    id: 'address',
    label: 'address',
    names: new Set([
      'street', 'street_address', 'address', 'address1', 'address2',
      'address_line1', 'address_line2', 'city', 'town', 'state', 'province',
      'region', 'zip', 'zip_code', 'postal_code', 'postcode', 'country',
      'country_code', 'latitude', 'longitude', 'lat', 'lng', 'lon',
    ]),
    prefixes: ['addr_'],
  },
];

/** Returns the first family a column name belongs to, or undefined. */
export function classifyColumnFamily(name: string): IColumnFamily | undefined {
  const lower = name.toLowerCase();
  for (const fam of EXTRACT_FAMILIES) {
    if (fam.names.has(lower)) return fam;
    if (fam.prefixes?.some((p) => lower.startsWith(p))) return fam;
  }
  return undefined;
}

/** Buckets a SQLite column type into the four storage classes for compatibility checks. */
export function sqlTypeBucket(sqlType: string): 'INTEGER' | 'REAL' | 'BLOB' | 'TEXT' {
  const u = sqlType.toUpperCase();
  if (u.includes('INT')) return 'INTEGER';
  if (u.includes('REAL') || u.includes('FLOA') || u.includes('DOUB')) return 'REAL';
  if (u.includes('BLOB')) return 'BLOB';
  return 'TEXT';
}

/** A column name shared across multiple tables with a single, consistent type bucket. */
export interface ISharedColumn {
  name: string;
  tables: string[];
  bucket: string;
}

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export function isTextLikeColumnType(sqlType: string): boolean {
  const u = sqlType.toUpperCase();
  return u.includes('TEXT') || u.includes('CHAR') || u.includes('CLOB');
}

export function rowToRecord(columns: string[], row: unknown[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < columns.length; i++) {
    out[columns[i]!] = row[i];
  }
  return out;
}

export function pickNumber(rec: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

export function migrationRiskFromRows(total: number): MigrationRisk {
  if (total > 100_000) return 'high';
  if (total > 10_000) return 'medium';
  return 'low';
}

export function severityFromRatio(ratio: number): RefactoringSeverity {
  return ratio < 0.02 ? 'high' : 'medium';
}
