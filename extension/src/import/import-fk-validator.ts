/**
 * Standalone foreign-key validation for import data.
 * Checks that FK values in rows exist in the referenced tables.
 * Extracted for Phase 2 modularization.
 */

import type { DriftApiClient } from '../api-client';
import type { IColumnMapping, IValidationResult } from './clipboard-import-types';

/**
 * Validates that foreign key values in the given rows exist in their
 * referenced tables. Only rows with missing references are included in results.
 *
 * @param client - API client for database queries
 * @param table - Source table with foreign key constraints
 * @param rows - Row data to validate
 * @param mapping - Column mappings (used to identify FK columns)
 * @returns Validation results for rows with missing FK references
 */
export async function validateForeignKeys(
  client: DriftApiClient,
  table: string,
  rows: Record<string, unknown>[],
  mapping: IColumnMapping[],
): Promise<IValidationResult[]> {
  const results: IValidationResult[] = [];

  try {
    const fkMeta = await client.tableFkMeta(table);
    if (fkMeta.length === 0) {
      return results;
    }

    for (const fk of fkMeta) {
      const fkValues = new Set<string>();
      const rowIndices: Map<string, number[]> = new Map();

      rows.forEach((row, i) => {
        const val = row[fk.fromColumn];
        if (val !== null && val !== undefined && val !== '') {
          const key = String(val);
          fkValues.add(key);
          const indices = rowIndices.get(key) ?? [];
          indices.push(i);
          rowIndices.set(key, indices);
        }
      });

      if (fkValues.size === 0) {
        continue;
      }

      const escapedValues = [...fkValues]
        .map((v) => `'${v.replace(/'/g, "''")}'`)
        .join(',');
      const sql = `SELECT "${fk.toColumn}" FROM "${fk.toTable}" WHERE "${fk.toColumn}" IN (${escapedValues})`;

      try {
        const result = await client.sql(sql);
        const existingValues = new Set(result.rows.map((r) => String(r[0])));

        for (const [value, indices] of rowIndices) {
          if (!existingValues.has(value)) {
            for (const rowIdx of indices) {
              let existing = results.find((r) => r.row === rowIdx);
              if (!existing) {
                existing = { row: rowIdx, errors: [], warnings: [] };
                results.push(existing);
              }
              existing.errors.push({
                column: fk.fromColumn,
                value,
                code: 'fk_missing',
                message: `Foreign key "${value}" not found in ${fk.toTable}.${fk.toColumn}`,
              });
            }
          }
        }
      } catch {
        // FK validation failed, skip this FK
      }
    }
  } catch {
    // Could not load FK metadata
  }

  return results;
}
