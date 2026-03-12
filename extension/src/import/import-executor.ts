/**
 * Import execution with transaction handling.
 * Supports multiple import strategies with rollback on failure.
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
import { ImportValidator } from './import-validator';

export class ImportExecutor {
  constructor(private readonly _client: DriftApiClient) {}

  /**
   * Execute import with the specified strategy.
   * All operations are performed in a transaction.
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
            const existing = await this._findExisting(table, row, matchColumns);

            if (existing) {
              const existingId = existing[pkColumn ?? matchColumns[0]] as string | number;
              result.updatedRows.push({
                id: existingId,
                previousValues: existing,
              });
              await this._updateRow(table, row, matchColumns);
              result.imported++;
            } else {
              const id = await this._insertRow(table, row, pkColumn);
              if (id !== undefined) {
                result.insertedIds.push(id);
              }
              result.imported++;
            }
          } else if (options.strategy === 'insert_skip_conflicts' && matchColumns.length > 0) {
            const existing = await this._findExisting(table, row, matchColumns);

            if (existing) {
              result.skipped++;
            } else {
              const id = await this._insertRow(table, row, pkColumn);
              if (id !== undefined) {
                result.insertedIds.push(id);
              }
              result.imported++;
            }
          } else {
            const id = await this._insertRow(table, row, pkColumn);
            if (id !== undefined) {
              result.insertedIds.push(id);
            }
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
        const existing = await this._findExisting(table, row, matchColumns);

        if (existing) {
          if (options.strategy === 'insert') {
            result.wouldSkip++;
          } else if (options.strategy === 'insert_skip_conflicts') {
            result.wouldSkip++;
          } else if (options.strategy === 'upsert') {
            result.wouldUpdate++;

            const diff: { column: string; from: unknown; to: unknown }[] = [];
            for (const [col, val] of Object.entries(row)) {
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
   */
  async undoImport(
    table: string,
    insertedIds: (string | number)[],
    updatedRows: IUpdatedRow[],
    pkColumn: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await this._client.sql('BEGIN TRANSACTION');

      for (const id of insertedIds) {
        await this._client.sql(
          `DELETE FROM "${table}" WHERE "${pkColumn}" = '${this._escape(String(id))}'`,
        );
      }

      for (const update of updatedRows) {
        const setClauses = Object.entries(update.previousValues)
          .filter(([col]) => col !== pkColumn)
          .map(([col, val]) => {
            if (val === null || val === undefined) {
              return `"${col}" = NULL`;
            }
            return `"${col}" = '${this._escape(String(val))}'`;
          })
          .join(', ');

        if (setClauses) {
          await this._client.sql(
            `UPDATE "${table}" SET ${setClauses} WHERE "${pkColumn}" = '${this._escape(String(update.id))}'`,
          );
        }
      }

      await this._client.sql('COMMIT');
      return { success: true };
    } catch (err) {
      try {
        await this._client.sql('ROLLBACK');
      } catch {
        // Ignore rollback errors
      }

      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  }

  private _getMatchColumns(options: IImportOptions, pkColumn: string | undefined): string[] {
    if (options.matchBy === 'pk' && pkColumn) {
      return [pkColumn];
    } else if (Array.isArray(options.matchBy)) {
      return options.matchBy;
    }
    return pkColumn ? [pkColumn] : [];
  }

  private async _findExisting(
    table: string,
    row: Record<string, unknown>,
    matchColumns: string[],
  ): Promise<Record<string, unknown> | null> {
    const conditions = matchColumns
      .filter((col) => row[col] !== null && row[col] !== undefined)
      .map((col) => `"${col}" = '${this._escape(String(row[col]))}'`)
      .join(' AND ');

    if (!conditions) {
      return null;
    }

    try {
      const result = await this._client.sql(
        `SELECT * FROM "${table}" WHERE ${conditions} LIMIT 1`,
      );

      if (result.rows.length === 0) {
        return null;
      }

      const existing: Record<string, unknown> = {};
      result.columns.forEach((col, i) => {
        existing[col] = result.rows[0][i];
      });
      return existing;
    } catch {
      return null;
    }
  }

  private async _insertRow(
    table: string,
    row: Record<string, unknown>,
    pkColumn: string | undefined,
  ): Promise<string | number | undefined> {
    const columns = Object.keys(row).filter((k) => row[k] !== undefined);
    const values = columns.map((col) => {
      const val = row[col];
      if (val === null) {
        return 'NULL';
      }
      return `'${this._escape(String(val))}'`;
    });

    const sql = `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${values.join(', ')})`;
    await this._client.sql(sql);

    if (pkColumn) {
      const lastId = await this._client.sql('SELECT last_insert_rowid()');
      if (lastId.rows.length > 0) {
        return lastId.rows[0][0] as number;
      }
    }

    return undefined;
  }

  private async _updateRow(
    table: string,
    row: Record<string, unknown>,
    matchColumns: string[],
  ): Promise<void> {
    const setClauses = Object.entries(row)
      .filter(([col]) => !matchColumns.includes(col))
      .map(([col, val]) => {
        if (val === null || val === undefined) {
          return `"${col}" = NULL`;
        }
        return `"${col}" = '${this._escape(String(val))}'`;
      })
      .join(', ');

    const conditions = matchColumns
      .map((col) => `"${col}" = '${this._escape(String(row[col]))}'`)
      .join(' AND ');

    if (setClauses && conditions) {
      await this._client.sql(`UPDATE "${table}" SET ${setClauses} WHERE ${conditions}`);
    }
  }

  private _escape(value: string): string {
    return value.replace(/'/g, "''");
  }
}
