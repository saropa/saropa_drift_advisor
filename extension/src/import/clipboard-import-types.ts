/**
 * Type definitions for clipboard import functionality.
 */

import type { ColumnMetadata } from '../api-types';

export type ClipboardFormat = 'tsv' | 'csv' | 'html';

export interface IParsedClipboard {
  format: ClipboardFormat;
  headers: string[];
  rows: string[][];
  rawText: string;
}

export interface IColumnMapping {
  clipboardIndex: number;
  clipboardHeader: string;
  tableColumn: string | null;
}

export type ImportStrategy = 'insert' | 'insert_skip_conflicts' | 'upsert' | 'dry_run';

export interface IImportOptions {
  strategy: ImportStrategy;
  matchBy: 'pk' | 'unique' | string[];
  continueOnError: boolean;
}

export interface IValidationError {
  column: string;
  value: unknown;
  code: 'type_mismatch' | 'not_null' | 'fk_missing' | 'unique_violation' | 'check_failed';
  message: string;
}

export interface IValidationWarning {
  column: string;
  code: 'truncation' | 'type_coercion' | 'default_applied';
  message: string;
}

export interface IValidationResult {
  row: number;
  errors: IValidationError[];
  warnings: IValidationWarning[];
}

export interface IRowError {
  row: number;
  error: string;
  data: Record<string, unknown>;
}

export interface IUpdatedRow {
  id: string | number;
  previousValues: Record<string, unknown>;
}

export interface IClipboardImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  errors: IRowError[];
  insertedIds: (string | number)[];
  updatedRows: IUpdatedRow[];
  transactionId?: string;
}

export interface IConflictPreview {
  row: number;
  existingId: string | number;
  existingValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
  diff: { column: string; from: unknown; to: unknown }[];
}

export interface IDryRunResult {
  wouldInsert: number;
  wouldUpdate: number;
  wouldSkip: number;
  conflicts: IConflictPreview[];
  validationErrors: IValidationResult[];
}

export interface ISchemaSnapshot {
  table: string;
  columns: { name: string; type: string; nullable: boolean }[];
  version: string;
  capturedAt: Date;
}

export interface IImportHistoryEntry {
  id: string;
  table: string;
  timestamp: Date;
  strategy: ImportStrategy;
  source: 'clipboard' | 'file' | 'api';
  format: ClipboardFormat;
  rowCount: number;
  insertedIds: (string | number)[];
  updatedRows: IUpdatedRow[];
  canUndo: boolean;
}

export interface IClipboardImportState {
  table: string;
  tableColumns: ColumnMetadata[];
  parsed: IParsedClipboard;
  mapping: IColumnMapping[];
  options: IImportOptions;
  schemaSnapshot: ISchemaSnapshot;
  validationResults?: IValidationResult[];
  dryRunResults?: IDryRunResult;
}
