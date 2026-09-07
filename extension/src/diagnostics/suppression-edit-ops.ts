/**
 * Low-level text-edit operations that insert inline suppression directives.
 * Split out of suppression-commands.ts.
 */

import * as vscode from 'vscode';

export const IGNORE_PREFIX = '// drift-advisor:ignore';

export interface IColumnArgs {
  uri: string;
  line: number;
  code: string;
}

export interface IFileArgs {
  uri: string;
  code: string;
}

/** Ask the diagnostic manager to re-run so the new directive is honored now. */
let _refresh: (() => void | Promise<void>) | undefined;

/** Wire up the refresh callback invoked after an edit is applied. */
export function setRefreshCallback(refresh: () => void | Promise<void>): void {
  _refresh = refresh;
}

async function refreshDiagnostics(): Promise<void> {
  await _refresh?.();
}

/** Insert a field-level ignore directive on the line above the diagnostic. */
export async function suppressInColumn(args: IColumnArgs): Promise<void> {
  const uri = vscode.Uri.parse(args.uri);
  const doc = await vscode.workspace.openTextDocument(uri);
  const targetLine = Math.max(0, Math.min(args.line, doc.lineCount - 1));

  // Match the indentation of the line being suppressed so the inserted comment
  // sits at the same level as the column getter it guards.
  const lineText = doc.lineAt(targetLine).text;
  const indent = lineText.slice(0, lineText.length - lineText.trimStart().length);

  const edit = new vscode.WorkspaceEdit();
  edit.insert(
    uri,
    new vscode.Position(targetLine, 0),
    `${indent}${IGNORE_PREFIX} ${args.code}\n`,
  );
  await vscode.workspace.applyEdit(edit);
  await refreshDiagnostics();
}

/** Insert a file-level ignore directive at the top of the file. */
export async function suppressInFile(args: IFileArgs): Promise<void> {
  const uri = vscode.Uri.parse(args.uri);
  const edit = new vscode.WorkspaceEdit();
  edit.insert(
    uri,
    new vscode.Position(0, 0),
    `${IGNORE_PREFIX}-file ${args.code}\n`,
  );
  await vscode.workspace.applyEdit(edit);
  await refreshDiagnostics();
}
