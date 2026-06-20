/**
 * Commands that INSERT inline suppression directives from the lightbulb / quick
 * fix menu, so users don't have to type `// drift-advisor:ignore` by hand.
 *
 * Two scopes mirror the parser in `suppression.ts`:
 * - column: a full-line `// drift-advisor:ignore <code>` directly above the
 *   diagnostic's line (the directive targets the next line).
 * - file: a `// drift-advisor:ignore-file <code>` at the top of the file.
 *
 * After applying the edit, a refresh is requested so the suppression takes
 * effect immediately — the workspace parser reads the in-memory (unsaved)
 * document text, so the new comment is honored before the file is even saved.
 */

import * as vscode from 'vscode';

const IGNORE_PREFIX = '// drift-advisor:ignore';

interface IColumnArgs {
  uri: string;
  line: number;
  code: string;
}

interface IFileArgs {
  uri: string;
  code: string;
}

/** Insert a field-level ignore directive on the line above the diagnostic. */
async function suppressInColumn(args: IColumnArgs): Promise<void> {
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
async function suppressInFile(args: IFileArgs): Promise<void> {
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

/** Ask the diagnostic manager to re-run so the new directive is honored now. */
let _refresh: (() => void | Promise<void>) | undefined;
async function refreshDiagnostics(): Promise<void> {
  await _refresh?.();
}

/**
 * Register the two suppression-insert commands. `refresh` re-runs diagnostics
 * after a directive is inserted so the silenced finding disappears immediately.
 */
export function registerSuppressionCommands(
  context: vscode.ExtensionContext,
  refresh: () => void | Promise<void>,
): void {
  _refresh = refresh;
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.suppressDiagnosticInColumn',
      (args: IColumnArgs) => suppressInColumn(args),
    ),
    vscode.commands.registerCommand(
      'driftViewer.suppressDiagnosticInFile',
      (args: IFileArgs) => suppressInFile(args),
    ),
  );
}
