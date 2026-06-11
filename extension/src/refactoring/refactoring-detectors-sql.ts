/**
 * SQL-probing refactoring detectors (Feature 66): normalization candidates
 * (low-cardinality text columns) and duplicate-column merge hints (cross-table
 * value overlap). These run read-only SQL via [DriftApiClient.sql] with
 * `{ internal: true }` so probe traffic is tagged extension-owned and excluded
 * from app perf stats. Per-probe failures are swallowed so one broken table
 * does not abort analysis.
 */

import type { DriftApiClient } from '../api-client';
import type { ForeignKey, TableMetadata } from '../api-types';
import type { IRefactoringSuggestion } from './refactoring-types';
import {
  isTextLikeColumnType,
  MERGE_MAX_ROWCOUNT_PER_TABLE,
  MERGE_MIN_OVERLAP,
  MERGE_OVERLAP_SUBQUERY_LIMIT,
  migrationRiskFromRows,
  NORMALIZE_MAX_DISTINCT,
  NORMALIZE_MAX_RATIO,
  NORMALIZE_MIN_ROWS,
  pickNumber,
  quoteIdent,
  rowToRecord,
  severityFromRatio,
} from './refactoring-analyzer-helpers';

export async function detectNormalization(
  client: DriftApiClient,
  tables: TableMetadata[],
): Promise<IRefactoringSuggestion[]> {
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
        const result = await client.sql(q, { internal: true });
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
        const topRes = await client.sql(topQ, { internal: true });
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

export async function detectDuplicateColumns(
  client: DriftApiClient,
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
          const result = await client.sql(q, { internal: true });
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
