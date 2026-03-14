/**
 * Validation and import execution for the clipboard import panel.
 * Extracted from clipboard-import-panel to keep panel under 300 lines.
 */

import type { DriftApiClient } from '../api-client';
import type { ColumnMetadata } from '../api-types';
import { buildImportPayload } from './clipboard-parser';
import type {
  IClipboardImportResult,
  IClipboardImportState,
  IColumnMapping,
  IDryRunResult,
  IImportOptions,
  IParsedClipboard,
  IValidationResult,
} from './clipboard-import-types';
import { ImportExecutor } from './import-executor';
import { ImportHistory } from './import-history';
import { validateForeignKeys } from './import-fk-validator';
import { ImportValidator } from './import-validator';
import { checkSchemaFreshnessForImport } from './schema-freshness';

/**
 * Run validation on parsed clipboard data and column mapping.
 * Validates schema constraints and FK references, returns sorted results per row.
 */
export async function runValidation(
  client: DriftApiClient,
  validator: ImportValidator,
  table: string,
  parsed: IParsedClipboard,
  mapping: IColumnMapping[],
  tableColumns: ColumnMetadata[],
  options: IImportOptions,
): Promise<IValidationResult[]> {
  const rows = buildImportPayload(parsed, mapping);

  const results = await validator.validate(
    table,
    rows,
    tableColumns,
    options,
  );

  const fkResults = await validateForeignKeys(
    client,
    table,
    rows,
    mapping,
  );

  for (const fkResult of fkResults) {
    const existing = results.find((r) => r.row === fkResult.row);
    if (existing) {
      existing.errors.push(...fkResult.errors);
      existing.warnings.push(...fkResult.warnings);
    } else {
      results.push(fkResult);
    }
  }

  results.sort((a, b) => a.row - b.row);
  return results;
}

/**
 * Execute dry run: preview inserts/updates without writing.
 */
export async function runDryRun(
  executor: ImportExecutor,
  table: string,
  parsed: IParsedClipboard,
  mapping: IColumnMapping[],
  tableColumns: ColumnMetadata[],
  options: IImportOptions,
): Promise<IDryRunResult> {
  const rows = buildImportPayload(parsed, mapping);
  return executor.dryRun(table, rows, tableColumns, options);
}

/**
 * Execute import (insert/upsert) and record in history on success.
 * Returns the executor result; caller is responsible for showing messages and updating UI.
 */
export async function runImport(
  executor: ImportExecutor,
  history: ImportHistory,
  table: string,
  parsed: IParsedClipboard,
  mapping: IColumnMapping[],
  tableColumns: ColumnMetadata[],
  options: IImportOptions,
): Promise<IClipboardImportResult> {
  const rows = buildImportPayload(parsed, mapping);

  const result = await executor.execute(
    table,
    rows,
    tableColumns,
    options,
  );

  if (result.success) {
    history.recordImport(table, result, options.strategy, parsed.format);
  }

  return result;
}

/** Outcome of executeImportFlow for the panel to apply to state and UI. */
export type ImportFlowOutcome =
  | { action: 'cancelled' }
  | { action: 'dryRun'; dryRunResults: IDryRunResult }
  | { action: 'success'; imported: number; skipped: number }
  | { action: 'error'; message: string };

/**
 * Run the full import flow: freshness check, optional confirm, then dry run or execute.
 * Caller provides confirmProceed (e.g. show WarningMessage) and applies the returned outcome to state/UI.
 */
export async function executeImportFlow(
  client: DriftApiClient,
  state: IClipboardImportState,
  executor: ImportExecutor,
  history: ImportHistory,
  confirmProceed: (changes: string[]) => Promise<boolean>,
): Promise<ImportFlowOutcome> {
  const freshness = await checkSchemaFreshnessForImport(
    client,
    state.table,
    state.schemaSnapshot,
  );
  if (!freshness.fresh) {
    const proceed = await confirmProceed(freshness.changes);
    if (!proceed) return { action: 'cancelled' };
  }

  if (state.options.strategy === 'dry_run') {
    const dryRunResults = await runDryRun(
      executor,
      state.table,
      state.parsed,
      state.mapping,
      state.tableColumns,
      state.options,
    );
    return { action: 'dryRun', dryRunResults };
  }

  const result = await runImport(
    executor,
    history,
    state.table,
    state.parsed,
    state.mapping,
    state.tableColumns,
    state.options,
  );

  if (result.success) {
    return { action: 'success', imported: result.imported, skipped: result.skipped };
  }
  const errorMessages = result.errors
    .slice(0, 3)
    .map((e) => `Row ${e.row + 1}: ${e.error}`)
    .join('\n');
  return { action: 'error', message: `Import failed:\n${errorMessages}` };
}
