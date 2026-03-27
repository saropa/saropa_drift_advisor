/**
 * Locates Drift `Table` subclasses and column getters in the workspace by SQL names.
 * Shared by Go-to-Definition in Dart strings and sidebar/schema-search navigation.
 */

import * as vscode from 'vscode';
import { escapeRegex, snakeToCamel, snakeToPascal } from '../dart-names';

/**
 * Finds the `class FooTable extends ...Table` declaration for a SQL table name.
 */
export async function findDriftTableClassLocation(
  sqlTableName: string,
): Promise<vscode.Location | null> {
  const className = escapeRegex(snakeToPascal(sqlTableName));
  const pattern = new RegExp(
    `class\\s+${className}\\s+extends\\s+\\w*Table\\b`,
  );

  const dartFiles = await vscode.workspace.findFiles(
    '**/*.dart',
    '**/build/**',
  );

  for (const fileUri of dartFiles) {
    const doc = await vscode.workspace.openTextDocument(fileUri);
    const text = doc.getText();
    const match = pattern.exec(text);
    if (match) {
      const pos = doc.positionAt(match.index);
      return new vscode.Location(fileUri, pos);
    }
  }
  return null;
}

/**
 * Finds the `get columnName =>` getter for a column within the table's Dart class.
 */
export async function findDriftColumnGetterLocation(
  columnName: string,
  sqlTableName: string,
): Promise<vscode.Location | null> {
  const className = escapeRegex(snakeToPascal(sqlTableName));
  const classPattern = new RegExp(
    `class\\s+${className}\\s+extends\\s+\\w*Table\\b`,
  );

  const dartFiles = await vscode.workspace.findFiles(
    '**/*.dart',
    '**/build/**',
  );

  for (const fileUri of dartFiles) {
    const doc = await vscode.workspace.openTextDocument(fileUri);
    const text = doc.getText();

    if (!classPattern.test(text)) continue;

    const camelName = snakeToCamel(columnName);
    const escapedOriginal = escapeRegex(columnName);
    const escapedCamel = escapeRegex(camelName);
    const names =
      camelName !== columnName
        ? `${escapedOriginal}|${escapedCamel}`
        : escapedOriginal;
    const colPattern = new RegExp(`get\\s+(${names})\\s*=>`);
    const colMatch = colPattern.exec(text);
    if (colMatch) {
      const pos = doc.positionAt(colMatch.index);
      return new vscode.Location(fileUri, pos);
    }
  }
  return null;
}

/** Opens an editor at the given location, or shows a short warning if none. */
export async function openLocationOrNotify(
  loc: vscode.Location | null,
  notFoundDetail: string,
): Promise<boolean> {
  if (!loc) {
    void vscode.window.showWarningMessage(
      `Could not find ${notFoundDetail} in the workspace.`,
    );
    return false;
  }
  const doc = await vscode.workspace.openTextDocument(loc.uri);
  const start = loc.range?.start ?? new vscode.Position(0, 0);
  await vscode.window.showTextDocument(doc, {
    selection: new vscode.Range(start, start),
    viewColumn: vscode.ViewColumn.Active,
  });
  return true;
}
