/**
 * Import executor with transaction handling and multiple strategies.
 *
 * This module handles the actual database operations for importing data,
 * supporting multiple import strategies:
 * - Insert: Add new rows, fail on conflicts
 * - Insert Skip Conflicts: Add new rows, skip duplicates silently
 * - Upsert: Add new rows, update existing ones
 * - Dry Run: Preview what would happen without making changes
 *
 * All import operations are wrapped in database transactions for atomicity.
 * Failed imports are rolled back, and the executor tracks inserted/updated
 * rows for potential undo operations.
 *
 * @module import-executor
 */

import type { DriftApiClient } from '../api-client';
import type { ColumnMetadata } from '../api-types';
import type {
  IClipboardImportResult,
  IConflictPreview,
  IDryRunResult,
  IImportOptions,
  IRowError,
  IUpdatedRow,
  IValidationResult,
} from './clipboard-import-types';
import {
  findExistingRow,
  insertRow,
  updateRow,
} from './import-sql-helpers';
import { undoImport } from './import-undo';
import { ImportValidator } from './import-validator';

/**
 * Executes database import operations with transaction safety.
 *
 * Handles row-by-row import with conflict detection and resolution
 * based on the selected strategy. Tracks all changes for undo support.
 *
 * @example
 * ```typescript
 * const executor = new ImportExecutor(apiClient);
 * const result = await executor.execute(tableName, rows, columns, options);
 * if (result.success) {
 *   console.log(`Imported ${result.imported} rows`);
 * }
 * ```
 */
export class ImportExecutor {
  /**
   * Create a new import executor.
   * @param _client - API client for database operations
   */
  constructor(private readonly _client: DriftApiClient) {}

  /**
   * Execute import with the specified strategy.
   *
   * All operations are wrapped in a database transaction. If any row
   * fails and continueOnError is false, the entire import is rolled back.
   * If continueOnError is true, failing rows are recorded and the
   * transaction commits with the successful rows.
   *
   * The method tracks:
   * - insertedIds: IDs of newly inserted rows (for undo via DELETE)
   * - updatedRows: Previous values of updated rows (for undo via UPDATE)
   *
   * @param table - Target table name
   * @param rows - Array of row objects to import
   * @param tableColumns - Table column metadata for PK detection
   * @param options - Import strategy and error handling options
   * @returns Import result with success status, counts, and error details
   * @throws Error if transaction fails and cannot be rolled back
   */
  async execute(
    table: string,
    rows: Record<string, unknown>[],
    tableColumns: ColumnMetadata[],
    options: IImportOptions,
  ): Promise<IClipboardImportResult> {
    const result: IClipboardImportResult = {
      success: false,
      imported: 0,
      skipped: 0,
      errors: [],
      insertedIds: [],
      updatedRows: [],
    };

    if (rows.length === 0) {
      result.success = true;
      return result;
    }

    const pkColumn = tableColumns.find((c) => c.pk)?.name;
    const matchColumns = this._getMatchColumns(options, pkColumn);

    try {
      await this._client.sql('BEGIN TRANSACTION');

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        try {
          if (options.strategy === 'upsert' && matchColumns.length > 0) {
            const existing = await findExistingRow(this._client, table, row, matchColumns);
            if (existing) {
              const existingId = existing[pkColumn ?? matchColumns[0]] as string | number;
              result.updatedRows.push({ id: existingId, previousValues: existing });
              await updateRow(this._client, table, row, matchColumns);
              result.imported++;
            } else {
              const id = await insertRow(this._client, table, row, pkColumn);
              if (id !== undefined) result.insertedIds.push(id);
              result.imported++;
            }
          } else if (options.strategy === 'insert_skip_conflicts' && matchColumns.length > 0) {
            const existing = await findExistingRow(this._client, table, row, matchColumns);
            if (existing) {
              result.skipped++;
            } else {
              const id = await insertRow(this._client, table, row, pkColumn);
              if (id !== undefined) result.insertedIds.push(id);
              result.imported++;
            }
          } else {
            const id = await insertRow(this._client, table, row, pkColumn);
            if (id !== undefined) result.insertedIds.push(id);
            result.imported++;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);

          if (!options.continueOnError) {
            await this._client.sql('ROLLBACK');
            result.errors.push({ row: i, error: message, data: row });
            return result;
          }

          result.errors.push({ row: i, error: message, data: row });
        }
      }

      await this._client.sql('COMMIT');
      result.success = true;
      return result;
    } catch (err) {
      try {
        await this._client.sql('ROLLBACK');
      } catch {
        // Rollback failed, transaction may already be aborted
      }

      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Import failed and was rolled back: ${message}`);
    }
  }

  /**
   * Perform a dry run to preview what would happen.
   *
   * Executes validation and conflict detection without modifying data.
   * For each row, determines whether it would be:
   * - Inserted as new (no matching row exists)
   * - Updated (upsert mode with matching row)
   * - Skipped (insert_skip_conflicts mode with matching row)
   *
   * For updates, generates a detailed diff showing which columns
   * would change and their before/after values.
   *
   * @param table - Target table name
   * @param rows - Array of row objects to preview
   * @param tableColumns - Table column metadata
   * @param options - Import options (strategy affects preview behavior)
   * @returns Dry run result with counts, conflicts, and validation errors
   */
  async dryRun(
    table: string,
    rows: Record<string, unknown>[],
    tableColumns: ColumnMetadata[],
    options: IImportOptions,
  ): Promise<IDryRunResult> {
    const validator = new ImportValidator(this._client);
    const validationErrors = await validator.validate(table, rows, tableColumns, options);

    const result: IDryRunResult = {
      wouldInsert: 0,
      wouldUpdate: 0,
      wouldSkip: 0,
      conflicts: [],
      validationErrors,
    };

    const pkColumn = tableColumns.find((c) => c.pk)?.name;
    const matchColumns = this._getMatchColumns(options, pkColumn);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      if (matchColumns.length > 0) {
        const existing = await findExistingRow(this._client, table, row, matchColumns);

        if (existing) {
          if (options.strategy === 'insert') {
            result.wouldSkip++;
          } else if (options.strategy === 'insert_skip_conflicts') {
            result.wouldSkip++;
          } else if (options.strategy === 'upsert') {
            result.wouldUpdate++;

            const diff: { column: string; from: unknown; to: unknown }[] = [];
            for (const [col, val] of Object.entries(row)) {
              if (matchColumns.includes(col)) continue;
              if (existing[col] !== val && val !== null && val !== undefined) {
                diff.push({ column: col, from: existing[col], to: val });
              }
            }

            if (diff.length > 0) {
              const conflictId = existing[pkColumn ?? matchColumns[0]] as string | number;
              result.conflicts.push({
                row: i,
                existingId: conflictId,
                existingValues: existing,
                newValues: row,
                diff,
              });
            }
          }
        } else {
          result.wouldInsert++;
        }
      } else {
        result.wouldInsert++;
      }
    }

    return result;
  }

  /**
   * Undo a previous import by deleting inserted rows and restoring updated rows.
   * Delegates to import-undo module.
   */
  async undoImport(
    table: string,
    insertedIds: (string | number)[],
    updatedRows: IUpdatedRow[],
    pkColumn: string,
  ): Promise<{ success: boolean; error?: string }> {
    return undoImport(this._client, table, insertedIds, updatedRows, pkColumn);
  }

  /** Resolve matchBy to column names: 'pk' → pk column, or array of columns. */
  private _getMatchColumns(options: IImportOptions, pkColumn: string | undefined): string[] {
    if (options.matchBy === 'pk' && pkColumn) {
      return [pkColumn];
    } else if (Array.isArray(options.matchBy)) {
      return options.matchBy;
    }
    return pkColumn ? [pkColumn] : [];
  }

}
