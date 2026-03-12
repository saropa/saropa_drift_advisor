/**
 * Pre-import validation logic.
 * Validates data types, constraints, and foreign keys before import.
 */

import type { DriftApiClient } from '../api-client';
import type { ColumnMetadata, TableMetadata } from '../api-types';
import type {
  IColumnMapping,
  IImportOptions,
  IValidationError,
  IValidationResult,
  IValidationWarning,
} from './clipboard-import-types';

export class ImportValidator {
  constructor(private readonly _client: DriftApiClient) {}

  /**
   * Validate all rows before import.
   * Returns validation results for rows with errors or warnings.
   */
  async validate(
    table: string,
    rows: Record<string, unknown>[],
    tableColumns: ColumnMetadata[],
    options: IImportOptions,
  ): Promise<IValidationResult[]> {
    const results: IValidationResult[] = [];
    const pkColumn = tableColumns.find((c) => c.pk)?.name;

    const existingKeys = options.strategy === 'insert'
      ? await this._loadExistingKeys(table, pkColumn)
      : new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const errors: IValidationError[] = [];
      const warnings: IValidationWarning[] = [];

      for (const [col, value] of Object.entries(row)) {
        const colSchema = tableColumns.find((c) => c.name === col);
        if (!colSchema) {
          continue;
        }

        if (value === null || value === undefined || value === '') {
          if (colSchema.notnull && !colSchema.pk) {
            errors.push({
              column: col,
              value,
              code: 'not_null',
              message: `Column "${col}" cannot be null`,
            });
          }
          continue;
        }

        const typeError = this._checkTypeCompatibility(String(value), colSchema.type);
        if (typeError) {
          errors.push({
            column: col,
            value,
            code: 'type_mismatch',
            message: typeError,
          });
        }

        if (colSchema.type === 'TEXT' && typeof value === 'string' && value.length > 65535) {
          warnings.push({
            column: col,
            code: 'truncation',
            message: `Value may be truncated (${value.length} chars)`,
          });
        }
      }

      if (options.strategy === 'insert' && pkColumn && row[pkColumn]) {
        const keyValue = String(row[pkColumn]);
        if (existingKeys.has(keyValue)) {
          errors.push({
            column: pkColumn,
            value: row[pkColumn],
            code: 'unique_violation',
            message: `Row with ${pkColumn}="${keyValue}" already exists`,
          });
        }
      }

      if (errors.length > 0 || warnings.length > 0) {
        results.push({ row: i, errors, warnings });
      }
    }

    return results;
  }

  /**
   * Check if a string value is compatible with a SQLite column type.
   */
  private _checkTypeCompatibility(value: string, type: string): string | null {
    const upperType = type.toUpperCase();

    if (upperType === 'INTEGER' || upperType === 'INT') {
      if (!/^-?\d+$/.test(value)) {
        return `Expected integer, got "${value}"`;
      }
    } else if (upperType === 'REAL' || upperType === 'FLOAT' || upperType === 'DOUBLE') {
      if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value)) {
        return `Expected number, got "${value}"`;
      }
    } else if (upperType === 'BOOLEAN' || upperType === 'BOOL') {
      const lower = value.toLowerCase();
      if (!['0', '1', 'true', 'false', 'yes', 'no'].includes(lower)) {
        return `Expected boolean, got "${value}"`;
      }
    }

    return null;
  }

  /**
   * Load existing primary key values for duplicate detection.
   */
  private async _loadExistingKeys(
    table: string,
    pkColumn: string | undefined,
  ): Promise<Set<string>> {
    if (!pkColumn) {
      return new Set();
    }

    try {
      const result = await this._client.sql(
        `SELECT "${pkColumn}" FROM "${table}"`,
      );
      return new Set(result.rows.map((r) => String(r[0])));
    } catch {
      return new Set();
    }
  }

  /**
   * Check if validation results contain any errors (not just warnings).
   */
  static hasErrors(results: IValidationResult[]): boolean {
    return results.some((r) => r.errors.length > 0);
  }

  /**
   * Count total errors across all validation results.
   */
  static countErrors(results: IValidationResult[]): number {
    return results.reduce((sum, r) => sum + r.errors.length, 0);
  }

  /**
   * Get rows that passed validation (no errors).
   */
  static getValidRows<T>(rows: T[], results: IValidationResult[]): T[] {
    const errorRows = new Set(results.filter((r) => r.errors.length > 0).map((r) => r.row));
    return rows.filter((_, i) => !errorRows.has(i));
  }
}

/**
 * Validate foreign key references exist.
 * This is a separate async check that can be performed optionally.
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
