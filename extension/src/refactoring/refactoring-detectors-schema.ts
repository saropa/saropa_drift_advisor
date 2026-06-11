/**
 * Schema-only refactoring detectors (Feature 66): wide-table split hints and
 * recurring column-bundle extraction. Deterministic — no SQL probes — so these
 * are cheap and stable for golden-fixture tests.
 */

import type { TableMetadata } from '../api-types';
import type { IRefactoringSuggestion } from './refactoring-types';
import {
  classifyColumnFamily,
  EXTRACT_FAMILIES,
  EXTRACT_FAMILY_CONFIDENCE,
  EXTRACT_GENERIC_CONFIDENCE,
  EXTRACT_MIN_GROUP_COLUMNS,
  EXTRACT_MIN_TABLES,
  sqlTypeBucket,
  WIDE_TABLE_MIN_COLUMNS,
  WIDE_TABLE_STRONG_COLUMNS,
  type ISharedColumn,
} from './refactoring-analyzer-helpers';

export function detectWideTables(tables: TableMetadata[]): IRefactoringSuggestion[] {
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
export function detectExtractGroups(tables: TableMetadata[]): IRefactoringSuggestion[] {
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
    suggestions.push(buildExtractSuggestion(cols, fam.label, EXTRACT_FAMILY_CONFIDENCE));
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
    suggestions.push(buildExtractSuggestion(cols, 'recurring', EXTRACT_GENERIC_CONFIDENCE));
  }

  return suggestions;
}

/** Assembles one `extract` suggestion from a bundle of shared columns. */
function buildExtractSuggestion(
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
