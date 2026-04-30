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
