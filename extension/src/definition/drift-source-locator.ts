/**
 * Locates Drift `Table` subclasses and column getters in the workspace by SQL names.
 * Shared by Go-to-Definition in Dart strings and sidebar navigation.
 */

import * as vscode from 'vscode';
import { escapeRegex, snakeToCamel, snakeToPascal } from '../dart-names';
import {
  DART_SOURCE_EXCLUDE_GLOB,
  positionFromOffset,
  readSourceText,
} from '../dart-source-reader';

/** Glob that finds all Dart files; paired with DART_SOURCE_EXCLUDE_GLOB. */
const DART_SOURCE_GLOB = '**/*.dart';

/**
 * Finds the `class FooTable extends ...Table` declaration for a SQL table name.
 *
 * Returns both the location (if found) and the number of files searched so
 * callers can surface diagnostic detail when nothing matches.
 */
export async function findDriftTableClassLocation(
  sqlTableName: string,
): Promise<{ location: vscode.Location | null; filesSearched: number }> {
  const className = escapeRegex(snakeToPascal(sqlTableName));
  // Match `class Foo extends Table`, `class Foo extends SomeTable`,
  // or `class Foo extends Table with ...` — any superclass ending in Table.
  const pattern = new RegExp(
    `class\\s+${className}\\s+extends\\s+\\w*Table\\b`,
  );

  const dartFiles = await vscode.workspace.findFiles(
    DART_SOURCE_GLOB,
    DART_SOURCE_EXCLUDE_GLOB,
  );

  for (const fileUri of dartFiles) {
    const text = await readSourceText(fileUri);
    const match = pattern.exec(text);
    if (match) {
      const pos = positionFromOffset(text, match.index);
      return {
        location: new vscode.Location(fileUri, pos),
        filesSearched: dartFiles.length,
      };
    }
  }
  return { location: null, filesSearched: dartFiles.length };
}

/**
 * Result from a column getter search. When the getter is not found but the
 * enclosing table class *is* found, `tableClassFallback` is set so callers
 * can navigate to the table instead of showing a dead-end "not found".
 */
export interface ColumnSearchResult {
  /** Exact getter location, if matched. */
  location: vscode.Location | null;
  /** Table class location when the getter itself wasn't found. */
  tableClassFallback: vscode.Location | null;
  /** Number of .dart source files scanned (for diagnostic messages). */
  filesSearched: number;
}

/**
 * Finds the `get columnName =>` getter for a column within the table's Dart class.
 * If the getter pattern is not matched but the table class is found, the class
 * location is returned as a fallback so callers can still navigate somewhere useful.
 */
export async function findDriftColumnGetterLocation(
  columnName: string,
  sqlTableName: string,
): Promise<ColumnSearchResult> {
  const className = escapeRegex(snakeToPascal(sqlTableName));
  const classPattern = new RegExp(
    `class\\s+${className}\\s+extends\\s+\\w*Table\\b`,
  );

  const dartFiles = await vscode.workspace.findFiles(
    DART_SOURCE_GLOB,
    DART_SOURCE_EXCLUDE_GLOB,
  );

  for (const fileUri of dartFiles) {
    const text = await readSourceText(fileUri);

    const classMatch = classPattern.exec(text);
    if (!classMatch) continue;

    // Table class found — now look for the column getter.
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
      const pos = positionFromOffset(text, colMatch.index);
      return {
        location: new vscode.Location(fileUri, pos),
        tableClassFallback: null,
        filesSearched: dartFiles.length,
      };
    }

    // Getter not found — return the table class as a fallback.
    const classPos = positionFromOffset(text, classMatch.index);
    return {
      location: null,
      tableClassFallback: new vscode.Location(fileUri, classPos),
      filesSearched: dartFiles.length,
    };
  }
  return { location: null, tableClassFallback: null, filesSearched: dartFiles.length };
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
