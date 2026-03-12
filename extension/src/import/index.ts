/**
 * Clipboard Import feature - public API exports.
 *
 * This module re-exports the public interface of the clipboard import
 * feature. Import from this module rather than individual files for
 * a stable API.
 *
 * Main components:
 * - ClipboardParser: Parse clipboard text into structured data
 * - ClipboardImportPanel: Interactive import UI panel
 * - ImportExecutor: Execute database import operations
 * - ImportValidator: Validate data before import
 * - ImportHistory: Track imports for undo support
 * - Schema utilities: Capture and check schema freshness
 *
 * @module import
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
