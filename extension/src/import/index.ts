/**
 * Clipboard Import feature exports.
 */

export { ClipboardParser, autoMapColumns, buildImportPayload } from './clipboard-parser';
export { ClipboardImportPanel } from './clipboard-import-panel';
export { registerClipboardImportCommands } from './clipboard-import-commands';
export { ImportValidator, validateForeignKeys } from './import-validator';
export { ImportExecutor } from './import-executor';
export { ImportHistory, formatHistoryEntry } from './import-history';
export {
  captureSchemaSnapshot,
  checkSchemaFreshness,
  computeSchemaVersion,
  getSnapshotAge,
} from './schema-freshness';

export type {
  ClipboardFormat,
  IClipboardImportResult,
  IClipboardImportState,
  IColumnMapping,
  IConflictPreview,
  IDryRunResult,
  IImportHistoryEntry,
  IImportOptions,
  ImportStrategy,
  IParsedClipboard,
  IRowError,
  ISchemaSnapshot,
  IUpdatedRow,
  IValidationError,
  IValidationResult,
  IValidationWarning,
} from './clipboard-import-types';
