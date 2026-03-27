/**
 * Pre-import data validation for clipboard imports.
 *
 * This module provides validation logic that runs before import to catch
 * issues early and provide helpful error messages. Validates:
 * - Data type compatibility (integers, floats, booleans)
 * - NOT NULL constraint violations
 * - Primary key uniqueness (duplicate detection)
 * - Foreign key references (optional, async check)
 * - Potential truncation for large text values
 *
 * Validation is designed to be fast and provide actionable feedback
 * without requiring database write operations.
 *
 * @module import-validator
 */

import type { DriftApiClient } from '../api-client';
import type { ColumnMetadata, TableMetadata } from '../api-types';
import { sqliteTypeCompatibilityError } from '../editing/sqlite-cell-value';
import type {
  IColumnMapping,
  IImportOptions,
  IValidationError,
  IValidationResult,
  IValidationWarning,
} from './clipboard-import-types';
export { validateForeignKeys } from './import-fk-validator';

/**
 * Validates import data against table schema before execution.
 *
 * Performs type checking, constraint validation, and duplicate detection
 * to provide early feedback on potential import issues.
 *
 * @example
 * ```typescript
 * const validator = new ImportValidator(apiClient);
 * const results = await validator.validate(table, rows, columns, options);
 * if (ImportValidator.hasErrors(results)) {
 *   console.log('Validation failed');
 * }
 * ```
 */
export class ImportValidator {
  /**
   * Create a new validator instance.
   * @param _client - API client for database queries (used for duplicate detection)
   */
  constructor(private readonly _client: DriftApiClient) {}

  /**
   * Validate all rows before import.
   *
   * Checks each row against the table schema for:
   * - Type compatibility (string values parsed against column types)
   * - NOT NULL constraints (empty/null values in required columns)
   * - Unique violations (for insert mode, checks existing PKs)
   * - Text truncation warnings (values exceeding 64KB)
   *
   * Only returns results for rows with at least one error or warning.
   * Rows that pass validation are not included in the results.
   *
   * @param table - Target table name
   * @param rows - Row data to validate
   * @param tableColumns - Column metadata for type/constraint info
   * @param options - Import options (affects duplicate checking)
   * @returns Array of validation results for problematic rows
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

        const typeError = sqliteTypeCompatibilityError(
          String(value),
          colSchema.type,
        );
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
   * Load existing primary key values for duplicate detection.
   *
   * Queries all existing PK values from the table to enable O(1)
   * duplicate checking during validation. This is more efficient
   * than checking each row individually.
   *
   * @param table - Table to query
   * @param pkColumn - Primary key column name
   * @returns Set of existing PK values as strings
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
   *
   * Warnings allow import to proceed; errors block the row from importing.
   *
   * @param results - Validation results to check
   * @returns true if any row has at least one error
   */
  static hasErrors(results: IValidationResult[]): boolean {
    return results.some((r) => r.errors.length > 0);
  }

  /**
   * Count total errors across all validation results.
   *
   * Sums errors from all rows for display in the UI (e.g., "5 errors found").
   *
   * @param results - Validation results to count
   * @returns Total number of individual errors
   */
  static countErrors(results: IValidationResult[]): number {
    return results.reduce((sum, r) => sum + r.errors.length, 0);
  }

  /**
   * Filter to rows that passed validation (no errors).
   *
   * Useful when continueOnError is true and you want to import
   * only the valid rows while reporting the invalid ones.
   *
   * @param rows - Original row array
   * @param results - Validation results with row indices
   * @returns Subset of rows that have no validation errors
   */
  static getValidRows<T>(rows: T[], results: IValidationResult[]): T[] {
    const errorRows = new Set(results.filter((r) => r.errors.length > 0).map((r) => r.row));
    return rows.filter((_, i) => !errorRows.has(i));
  }
}

