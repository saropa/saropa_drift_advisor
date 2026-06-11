/**
 * SQL-import handling for the Visual Query Builder: parse a SELECT into a query
 * model and surface hard errors / warnings / success as VS Code notifications.
 * Returns the new model on success, or undefined when the import failed (the
 * panel keeps its current model). Extracted from query-builder-panel.ts.
 */
import * as vscode from 'vscode';
import type { TableMetadata } from '../api-client';
import type { IQueryModel } from './query-model';
import { importSelectSqlToModel } from './sql-import';

export function applySqlImport(
  sql: string,
  tables: TableMetadata[],
): IQueryModel | undefined {
  const { model, errors, warnings } = importSelectSqlToModel(sql, tables);
  if (errors.length > 0) {
    void vscode.window.showErrorMessage(
      `Cannot import SQL into the visual builder: ${errors.join('; ')}`,
    );
    return undefined;
  }
  if (warnings.length > 0) {
    void vscode.window.showWarningMessage(
      `Imported with notes: ${warnings.join(' · ')}`,
    );
  } else {
    void vscode.window.showInformationMessage('SQL imported into the visual query builder.');
  }
  return model;
}
