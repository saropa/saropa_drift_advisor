/**
 * Heuristic analyzer for schema refactoring suggestions (Feature 66).
 *
 * Uses read-only SQL via [DriftApiClient.sql] with `{ internal: true }` so
 * probe traffic is tagged as extension-owned and excluded from app perf stats.
 */

import type { DriftApiClient } from '../api-client';
import type { ForeignKey, TableMetadata } from '../api-types';
import type {
  IRefactoringSuggestion,
  MigrationRisk,
  RefactoringSeverity,
} from './refactoring-types';

/** Minimum populated rows before normalization heuristics apply. */
const NORMALIZE_MIN_ROWS = 50;
/** Maximum distinct text values to still consider a normalization candidate. */
const NORMALIZE_MAX_DISTINCT = 20;
/** Distinct/total ratio must stay below this for normalization. */
const NORMALIZE_MAX_RATIO = 0.1;
/** Confidence cutoff after scoring (matches Feature 66 plan). */
const CONFIDENCE_THRESHOLD = 0.5;
/** Column count above which a "wide table" split hint is emitted. */
const WIDE_TABLE_MIN_COLUMNS = 13;
/** Stronger split confidence when very wide. */
const WIDE_TABLE_STRONG_COLUMNS = 21;
/** Do not run pairwise merge probes beyond this table count (keeps analysis bounded). */
const MERGE_MAX_TABLES = 40;
/** Cap overlap subquery rows so accidental cartesian products stay bounded. */
const MERGE_OVERLAP_SUBQUERY_LIMIT = 10_001;
/** Minimum overlapping rows to emit a merge hint (reduces accidental string matches). */
const MERGE_MIN_OVERLAP = 5;
/** Skip merge overlap SQL when either table exceeds this row count. */
const MERGE_MAX_ROWCOUNT_PER_TABLE = 50_000;
/** Minimum distinct tables a column must appear in to count toward an extract bundle. */
const EXTRACT_MIN_TABLES = 2;
/** Minimum columns in a recurring bundle before suggesting extraction. */
const EXTRACT_MIN_GROUP_COLUMNS = 2;
/** Confidence for a bundle matching a known column family (audit/address/etc.). */
const EXTRACT_FAMILY_CONFIDENCE = 0.8;
/** Confidence for a generic bundle (no known family, but identical table set). */
const EXTRACT_GENERIC_CONFIDENCE = 0.62;

/**
 * Known column families recognized by the extract detector. Names are matched
 * case-insensitively; `prefixes` catch convention-named blocks (e.g. `addr_*`).
 * Families let detection tolerate ragged table sets (audit/address columns
 * rarely appear in an identical set of tables), unlike the generic pass.
 */
interface IColumnFamily {
  id: string;
  label: string;
  names: ReadonlySet<string>;
  prefixes?: readonly string[];
}

const EXTRACT_FAMILIES: readonly IColumnFamily[] = [
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
function classifyColumnFamily(name: string): IColumnFamily | undefined {
  const lower = name.toLowerCase();
  for (const fam of EXTRACT_FAMILIES) {
    if (fam.names.has(lower)) return fam;
    if (fam.prefixes?.some((p) => lower.startsWith(p))) return fam;
  }
  return undefined;
}

/** Buckets a SQLite column type into the four storage classes for compatibility checks. */
function sqlTypeBucket(sqlType: string): 'INTEGER' | 'REAL' | 'BLOB' | 'TEXT' {
  const u = sqlType.toUpperCase();
  if (u.includes('INT')) return 'INTEGER';
  if (u.includes('REAL') || u.includes('FLOA') || u.includes('DOUB')) return 'REAL';
  if (u.includes('BLOB')) return 'BLOB';
  return 'TEXT';
}

/** A column name shared across multiple tables with a single, consistent type bucket. */
interface ISharedColumn {
  name: string;
  tables: string[];
  bucket: string;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function isTextLikeColumnType(sqlType: string): boolean {
  const u = sqlType.toUpperCase();
  return u.includes('TEXT') || u.includes('CHAR') || u.includes('CLOB');
}

function rowToRecord(columns: string[], row: unknown[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < columns.length; i++) {
    out[columns[i]!] = row[i];
  }
  return out;
}

function pickNumber(rec: Record<string, unknown>, keys: string[]): number {
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

function migrationRiskFromRows(total: number): MigrationRisk {
  if (total > 100_000) return 'high';
  if (total > 10_000) return 'medium';
  return 'low';
}

function severityFromRatio(ratio: number): RefactoringSeverity {
  return ratio < 0.02 ? 'high' : 'medium';
}

/**
 * Produces ranked refactoring suggestions for the connected Drift database.
 */
export class RefactoringAnalyzer {
  constructor(private readonly _client: DriftApiClient) {}

  /**
   * Runs detectors over user tables (skips `sqlite_%`), returns sorted suggestions.
   *
   * Per-table SQL failures are swallowed so one broken table does not abort analysis.
   */
  async analyze(): Promise<IRefactoringSuggestion[]> {
    const suggestions: IRefactoringSuggestion[] = [];
    let tables: TableMetadata[] = [];
    try {
      tables = await this._client.schemaMetadata();
    } catch {
      return [];
    }
    const userTables = tables.filter((t) => !t.name.startsWith('sqlite_'));

    const fkCache = new Map<string, ForeignKey[]>();
    const loadFks = async (name: string): Promise<ForeignKey[]> => {
      const hit = fkCache.get(name);
      if (hit) return hit;
      const fks = await this._client.tableFkMeta(name).catch(() => [] as ForeignKey[]);
      fkCache.set(name, fks);
      return fks;
    };

    suggestions.push(...(await this._detectNormalization(userTables)));
    suggestions.push(...this._detectWideTables(userTables));
    suggestions.push(...this._detectExtractGroups(userTables));

    if (userTables.length <= MERGE_MAX_TABLES) {
      suggestions.push(...(await this._detectDuplicateColumns(userTables, loadFks)));
    }

    return suggestions
      .filter((s) => s.confidence > CONFIDENCE_THRESHOLD)
      .sort((a, b) => b.confidence - a.confidence || (a.id < b.id ? -1 : 1));
  }

  private async _detectNormalization(tables: TableMetadata[]): Promise<IRefactoringSuggestion[]> {
    const suggestions: IRefactoringSuggestion[] = [];

    for (const table of tables) {
      const textCols = table.columns.filter((c) => isTextLikeColumnType(c.type) && !c.pk);

      for (const col of textCols) {
        const qc = quoteIdent(col.name);
        const qt = quoteIdent(table.name);
        let distinct = 0;
        let total = 0;
        try {
          const q = `SELECT COUNT(DISTINCT ${qc}) AS distinct_count, COUNT(${qc}) AS total FROM ${qt} WHERE ${qc} IS NOT NULL`;
          const result = await this._client.sql(q, { internal: true });
          const rec = rowToRecord(result.columns, result.rows[0] ?? []);
          distinct = Math.floor(pickNumber(rec, ['distinct_count', 'DISTINCT_COUNT']));
          total = Math.floor(pickNumber(rec, ['total', 'TOTAL']));
        } catch {
          continue;
        }

        if (distinct <= 0 || total < NORMALIZE_MIN_ROWS) continue;
        const ratio = distinct / total;
        if (distinct > NORMALIZE_MAX_DISTINCT || ratio >= NORMALIZE_MAX_RATIO) continue;

        let topValues: Array<{ value: string; count: number }> | undefined;
        try {
          const topQ = `SELECT ${qc} AS v, COUNT(*) AS c FROM ${qt} WHERE ${qc} IS NOT NULL GROUP BY ${qc} ORDER BY c DESC LIMIT 5`;
          const topRes = await this._client.sql(topQ, { internal: true });
          topValues = topRes.rows.map((row) => {
            const r = rowToRecord(topRes.columns, row);
            const value = String(r['v'] ?? '');
            const count = Math.floor(pickNumber(r, ['c', 'C']));
            return { value, count };
          });
        } catch {
          topValues = undefined;
        }

        const id = `normalize:${table.name}:${col.name}`;
        suggestions.push({
          id,
          type: 'normalize',
          title: `Normalize ${table.name}.${col.name}`,
          description: `${col.name} has ${distinct} distinct values across ${total} populated rows. Consider a lookup table with a foreign key.`,
          tables: [table.name],
          columns: [col.name],
          evidence: [
            `${distinct} distinct values`,
            `${total} populated rows`,
            `distinct/total ratio=${ratio.toFixed(4)}`,
          ],
          topValues,
          severity: severityFromRatio(ratio),
          impact: {
            integrityImproved: true,
            queryComplexity: 'more-complex',
          },
          estimatedMigrationRisk: migrationRiskFromRows(total),
          confidence: ratio < 0.01 ? 0.9 : 0.7,
        });
      }
    }

    return suggestions;
  }

  private _detectWideTables(tables: TableMetadata[]): IRefactoringSuggestion[] {
    return tables
      .filter((t) => t.columns.length >= WIDE_TABLE_MIN_COLUMNS)
      .map((table) => {
        const optional = table.columns.filter((c) => !c.pk);
        const colCount = table.columns.length;
        const id = `split:${table.name}`;
        return {
          id,
          type: 'split' as const,
          title: `Split ${table.name} (${colCount} columns)`,
          description: `Table has ${colCount} columns. Consider moving rarely used columns into a child table keyed by the primary key.`,
          tables: [table.name],
          columns: optional.map((c) => c.name),
          evidence: [
            `${colCount} total columns`,
            `${optional.length} non-primary-key columns`,
          ],
          severity: colCount > 24 ? 'high' : 'medium',
          impact: {
            integrityImproved: false,
            queryComplexity: 'more-complex',
          },
          estimatedMigrationRisk: colCount > 24 ? 'high' : 'medium',
          confidence: colCount >= WIDE_TABLE_STRONG_COLUMNS ? 0.8 : 0.6,
        };
      });
  }

  /**
   * Detects column bundles that recur across two or more tables (audit
   * timestamps, address blocks, soft-delete flags, or any generic group that
   * always appears together). Schema-only and deterministic — no SQL probes —
   * so it is cheap and stable for golden-fixture tests.
   */
  private _detectExtractGroups(tables: TableMetadata[]): IRefactoringSuggestion[] {
    // Index every non-PK column name to the tables it appears in and the type
    // buckets observed. A name with conflicting buckets across tables is later
    // dropped: extracting it would force a lossy single-type decision.
    const byName = new Map<string, { tables: Set<string>; buckets: Set<string> }>();
    for (const table of tables) {
      for (const col of table.columns) {
        if (col.pk) continue;
        const key = col.name.toLowerCase();
        let entry = byName.get(key);
        if (!entry) {
          entry = { tables: new Set(), buckets: new Set() };
          byName.set(key, entry);
        }
        entry.tables.add(table.name);
        entry.buckets.add(sqlTypeBucket(col.type));
      }
    }

    // Keep only columns shared across enough tables with a single type bucket.
    const shared: ISharedColumn[] = [];
    for (const [name, entry] of byName) {
      if (entry.tables.size < EXTRACT_MIN_TABLES) continue;
      if (entry.buckets.size !== 1) continue;
      shared.push({ name, tables: [...entry.tables].sort(), bucket: [...entry.buckets][0]! });
    }

    const suggestions: IRefactoringSuggestion[] = [];

    // Family pass: group shared columns by known family. Tolerant of ragged
    // table sets because audit/address columns rarely span an identical set.
    const familyCols = new Map<string, ISharedColumn[]>();
    for (const col of shared) {
      const fam = classifyColumnFamily(col.name);
      if (!fam) continue;
      let arr = familyCols.get(fam.id);
      if (!arr) {
        arr = [];
        familyCols.set(fam.id, arr);
      }
      arr.push(col);
    }
    for (const [famId, cols] of familyCols) {
      if (cols.length < EXTRACT_MIN_GROUP_COLUMNS) continue;
      const fam = EXTRACT_FAMILIES.find((f) => f.id === famId)!;
      suggestions.push(this._buildExtractSuggestion(cols, fam.label, EXTRACT_FAMILY_CONFIDENCE));
    }

    // Generic pass: non-family columns grouped by identical table set — a
    // strong signal they form one extractable unit. Family columns are excluded
    // so a bundle is never reported twice.
    const genericBySig = new Map<string, ISharedColumn[]>();
    for (const col of shared) {
      if (classifyColumnFamily(col.name)) continue;
      const sig = col.tables.join('|');
      let arr = genericBySig.get(sig);
      if (!arr) {
        arr = [];
        genericBySig.set(sig, arr);
      }
      arr.push(col);
    }
    for (const cols of genericBySig.values()) {
      if (cols.length < EXTRACT_MIN_GROUP_COLUMNS) continue;
      suggestions.push(this._buildExtractSuggestion(cols, 'recurring', EXTRACT_GENERIC_CONFIDENCE));
    }

    return suggestions;
  }

  /** Assembles one `extract` suggestion from a bundle of shared columns. */
  private _buildExtractSuggestion(
    cols: ISharedColumn[],
    label: string,
    confidence: number,
  ): IRefactoringSuggestion {
    const sortedColumns = cols.map((c) => c.name).sort();
    const tableSet = new Set<string>();
    for (const c of cols) {
      for (const t of c.tables) tableSet.add(t);
    }
    const tables = [...tableSet].sort();
    const colList = sortedColumns.join(', ');
    // Stable id: same schema always yields the same suggestion id (label slug +
    // sorted column names), so the panel can dismiss/request plans safely.
    const id = `extract:${label.replace(/[^a-z0-9]+/gi, '-')}:${sortedColumns.join(',')}`;

    return {
      id,
      type: 'extract',
      title: `Extract ${label} columns (${colList})`,
      description: `Columns ${colList} repeat across ${tables.length} tables (${tables.join(', ')}). Consider a shared table or Drift mixin so they are defined once.`,
      tables,
      columns: sortedColumns,
      evidence: [
        `${sortedColumns.length} columns recur across ${tables.length} tables`,
        `columns: ${colList}`,
        ...cols.map((c) => `${c.name} in ${c.tables.length} tables (${c.bucket})`),
      ],
      severity: tables.length >= 3 ? 'high' : 'medium',
      impact: { integrityImproved: true, queryComplexity: 'more-complex' },
      estimatedMigrationRisk: tables.length >= 3 ? 'high' : 'medium',
      confidence,
    };
  }

  private async _detectDuplicateColumns(
    tables: TableMetadata[],
    loadFks: (name: string) => Promise<ForeignKey[]>,
  ): Promise<IRefactoringSuggestion[]> {
    const suggestions: IRefactoringSuggestion[] = [];

    for (let i = 0; i < tables.length; i++) {
      for (let j = i + 1; j < tables.length; j++) {
        const ti = tables[i]!;
        const tj = tables[j]!;
        if (ti.rowCount > MERGE_MAX_ROWCOUNT_PER_TABLE || tj.rowCount > MERGE_MAX_ROWCOUNT_PER_TABLE) {
          continue;
        }

        const fksI = await loadFks(ti.name);
        const fksJ = await loadFks(tj.name);

        for (const colI of ti.columns) {
          if (colI.pk) continue;
          const colJ = tj.columns.find((c) => c.name === colI.name && !c.pk);
          if (!colJ) continue;

          const linked =
            fksI.some((fk) => fk.fromColumn === colI.name && fk.toTable === tj.name) ||
            fksJ.some((fk) => fk.fromColumn === colJ.name && fk.toTable === ti.name);
          if (linked) continue;

          const qCol = quoteIdent(colI.name);
          const qi = quoteIdent(ti.name);
          const qj = quoteIdent(tj.name);
          let overlap = 0;
          try {
            const q = `SELECT COUNT(*) AS cnt FROM (SELECT 1 AS x FROM ${qi} a INNER JOIN ${qj} b ON a.${qCol} = b.${qCol} LIMIT ${MERGE_OVERLAP_SUBQUERY_LIMIT})`;
            const result = await this._client.sql(q, { internal: true });
            const rec = rowToRecord(result.columns, result.rows[0] ?? []);
            overlap = Math.floor(pickNumber(rec, ['cnt', 'CNT']));
          } catch {
            continue;
          }

          if (overlap < MERGE_MIN_OVERLAP) continue;

          const capped = overlap >= MERGE_OVERLAP_SUBQUERY_LIMIT - 1;
          const id = `merge:${ti.name}:${tj.name}:${colI.name}`;
          suggestions.push({
            id,
            type: 'merge',
            title: `Merge: ${ti.name}.${colI.name} ↔ ${tj.name}.${colJ.name}`,
            description: capped
              ? `Many rows share the same ${colI.name} value between tables (sample capped at ${MERGE_OVERLAP_SUBQUERY_LIMIT - 1}+). Consider replacing denormalized text with a foreign key where semantics match.`
              : `${overlap} join rows match on ${colI.name}. Consider a foreign key if one column logically references the other.`,
            tables: [ti.name, tj.name],
            columns: [colI.name],
            evidence: capped
              ? [`${MERGE_OVERLAP_SUBQUERY_LIMIT - 1}+ overlapping joined rows (capped scan)`]
              : [`${overlap} overlapping joined rows`],
            severity: 'medium',
            impact: { integrityImproved: true, queryComplexity: 'same' },
            estimatedMigrationRisk: 'medium',
            confidence: capped ? 0.55 : 0.62,
          });
        }
      }
    }

    return suggestions;
  }
}
