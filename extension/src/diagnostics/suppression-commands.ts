/**
 * Commands that INSERT inline suppression directives, so users don't have to
 * type `// drift-advisor:ignore` by hand.
 *
 * Two scopes mirror the parser in `suppression.ts`:
 * - column: a full-line `// drift-advisor:ignore <code>` directly above the
 *   diagnostic's line (the directive targets the next line).
 * - file: a `// drift-advisor:ignore-file <code>` at the top of the file.
 *
 * After applying the edit, a refresh is requested so the suppression takes
 * effect immediately — the workspace parser reads the in-memory (unsaved)
 * document text, so the new comment is honored before the file is even saved.
 *
 * Two entry points reach these directives:
 * 1. The lightbulb / Ctrl+. quick fix, wired to `suppressDiagnosticInColumn`
 *    / `suppressDiagnosticInFile` with an exact (uri, line, code) already
 *    resolved by `buildSuppressionQuickFixes` (diagnostic-apply.ts) — only
 *    available when the cursor sits inside the diagnostic's own range.
 * 2. `suppressDiagnosticAtCursor` / `suppressDiagnosticAtCursorFile`, bound
 *    to the editor right-click menu and Command Palette. VS Code's Problems
 *    panel has no extension-contributable context menu (no `problems/item/
 *    context` point exists), so double-clicking a Problems row only moves
 *    the cursor to the diagnostic's line without opening the quick-fix menu
 *    at that exact position. These commands remove the precision requirement
 *    entirely: they resolve the diagnostic from the CURSOR LINE against
 *    `vscode.languages.getDiagnostics`, falling back to the closest Drift
 *    Advisor diagnostic within `NEAR_CURSOR_LINE_WINDOW` lines, and prompt
 *    with a QuickPick whenever more than one diagnostic ties for closest —
 *    same line or not. The fallback is bounded by the same window the
 *    right-click menu's visibility uses, so a menu click and a Command
 *    Palette invocation always resolve consistently.
 */

import * as vscode from 'vscode';
import { DIAGNOSTIC_SOURCE } from './diagnostic-types';

const IGNORE_PREFIX = '// drift-advisor:ignore';
/**
 * Lines above/below the cursor still counted as "near" for both the
 * cursor-resolution fallback and the editor-context menu's visibility check.
 * Shared so the menu never shows for a position the resolver would then
 * refuse (or vice versa) — see the module doc comment.
 */
const NEAR_CURSOR_LINE_WINDOW = 3;

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

/**
 * Resolve which Drift Advisor diagnostic the user means from the active
 * editor's cursor, tolerant of the cursor sitting anywhere on the flagged
 * line (not just inside the diagnostic's own start/end columns) and falling
 * back to the nearest Drift Advisor diagnostic within `NEAR_CURSOR_LINE_WINDOW`
 * lines when the cursor line has none. The fallback is bounded (not "nearest
 * in the whole file") so this always agrees with the right-click menu's own
 * visibility check — invoking via Command Palette from far outside the window
 * is refused with the same message the menu's absence implies, rather than
 * silently resolving to a diagnostic the user was nowhere near.
 *
 * Ties — same line or not — are resolved with a QuickPick showing each
 * candidate's line number, code, and message, rather than a distance-order
 * pick the user has no way to see or object to.
 *
 * Returns undefined (after notifying the user) when the file has no Drift
 * Advisor diagnostics near the cursor, or the user cancels a tie-break
 * QuickPick.
 */
async function resolveDiagnosticAtCursor(): Promise<
  { document: vscode.TextDocument; diagnostic: vscode.Diagnostic } | undefined
> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage(
      'Open the file with the Drift Advisor finding, then place the cursor on it.',
    );
    return undefined;
  }

  const document = editor.document;
  const driftDiagnostics = vscode.languages
    .getDiagnostics(document.uri)
    .filter((d) => d.source === DIAGNOSTIC_SOURCE);

  if (driftDiagnostics.length === 0) {
    vscode.window.showWarningMessage(
      'No Drift Advisor findings in this file.',
    );
    return undefined;
  }

  const cursorLine = editor.selection.active.line;
  const nearby = driftDiagnostics
    .map((d) => ({ diagnostic: d, distance: Math.abs(d.range.start.line - cursorLine) }))
    .filter((entry) => entry.distance <= NEAR_CURSOR_LINE_WINDOW);

  if (nearby.length === 0) {
    vscode.window.showWarningMessage(
      `No Drift Advisor finding within ${NEAR_CURSOR_LINE_WINDOW} lines of the cursor.`,
    );
    return undefined;
  }

  // Every diagnostic tied for closest — usually one, but the picker also
  // covers two equidistant findings on different lines, not just same-line
  // ties, so a silent distance-order pick never happens.
  const closestDistance = Math.min(...nearby.map((entry) => entry.distance));
  const candidates = nearby
    .filter((entry) => entry.distance === closestDistance)
    .map((entry) => entry.diagnostic);

  let chosen: vscode.Diagnostic;
  if (candidates.length === 1) {
    chosen = candidates[0];
  } else {
    const picked = await vscode.window.showQuickPick(
      candidates.map((d) => ({
        label: String(d.code ?? ''),
        description: `Line ${d.range.start.line + 1}`,
        detail: d.message,
        diagnostic: d,
      })),
      { placeHolder: 'Multiple Drift Advisor findings near the cursor — pick one' },
    );
    if (!picked) {
      return undefined;
    }
    chosen = picked.diagnostic;
  }

  // Diagnostics without a usable code cannot become a targeted directive —
  // an empty code string parses as a bare `// drift-advisor:ignore` (no
  // code), which `suppression.ts`'s parser treats as "silence every code on
  // this line/file", not "silence this one". Refuse rather than write that.
  if (typeof chosen.code !== 'string' || chosen.code.length === 0) {
    vscode.window.showWarningMessage(
      'This finding has no diagnostic code and cannot be ignored individually.',
    );
    return undefined;
  }

  return { document, diagnostic: chosen };
}

/** Editor-context-menu / Command Palette entry point: ignore for this column. */
async function suppressAtCursorColumn(): Promise<void> {
  const resolved = await resolveDiagnosticAtCursor();
  if (!resolved) {
    return;
  }
  await suppressInColumn({
    uri: resolved.document.uri.toString(),
    line: resolved.diagnostic.range.start.line,
    code: resolved.diagnostic.code as string,
  });
}

/** Editor-context-menu / Command Palette entry point: ignore in this file. */
async function suppressAtCursorFile(): Promise<void> {
  const resolved = await resolveDiagnosticAtCursor();
  if (!resolved) {
    return;
  }
  await suppressInFile({
    uri: resolved.document.uri.toString(),
    code: resolved.diagnostic.code as string,
  });
}

/** Ask the diagnostic manager to re-run so the new directive is honored now. */
let _refresh: (() => void | Promise<void>) | undefined;
async function refreshDiagnostics(): Promise<void> {
  await _refresh?.();
}

const CONTEXT_HAS_FINDING_NEAR_CURSOR = 'driftViewer.hasFindingNearCursor';
/** Debounce (ms) for selection-based context update to avoid work on every cursor move. */
const SELECTION_DEBOUNCE_MS = 50;

/**
 * Updates the "finding near cursor" context key gating the editor right-click
 * menu item, so it only appears in files/positions where the cursor-based
 * ignore commands would actually resolve a Drift Advisor diagnostic.
 */
function updateHasFindingNearCursorContext(): void {
  const editor = vscode.window.activeTextEditor;
  const cursorLine = editor?.selection.active.line;
  const hasNearby =
    editor !== undefined &&
    cursorLine !== undefined &&
    vscode.languages
      .getDiagnostics(editor.document.uri)
      .some(
        (d) =>
          d.source === DIAGNOSTIC_SOURCE &&
          Math.abs(d.range.start.line - cursorLine) <= NEAR_CURSOR_LINE_WINDOW,
      );
  void vscode.commands.executeCommand(
    'setContext',
    CONTEXT_HAS_FINDING_NEAR_CURSOR,
    hasNearby,
  );
}

/**
 * Register the suppression-insert commands. `refresh` re-runs diagnostics
 * after a directive is inserted so the silenced finding disappears immediately.
 */
export function registerSuppressionCommands(
  context: vscode.ExtensionContext,
  refresh: () => void | Promise<void>,
): void {
  _refresh = refresh;

  // Keep the editor-context-menu visibility key current: cursor movement,
  // switching editors, and diagnostics changing (a refresh can add/remove
  // findings without the cursor moving) all need to re-evaluate it.
  updateHasFindingNearCursorContext();
  let selectionDebounce: ReturnType<typeof setTimeout> | undefined;
  const scheduleContextUpdate = (): void => {
    if (selectionDebounce !== undefined) {
      clearTimeout(selectionDebounce);
    }
    selectionDebounce = setTimeout(() => {
      selectionDebounce = undefined;
      updateHasFindingNearCursorContext();
    }, SELECTION_DEBOUNCE_MS);
  };
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(updateHasFindingNearCursorContext),
    vscode.window.onDidChangeTextEditorSelection(scheduleContextUpdate),
    vscode.languages.onDidChangeDiagnostics(scheduleContextUpdate),
    {
      dispose: () => {
        if (selectionDebounce !== undefined) {
          clearTimeout(selectionDebounce);
        }
      },
    },
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'driftViewer.suppressDiagnosticInColumn',
      (args: IColumnArgs) => suppressInColumn(args),
    ),
    vscode.commands.registerCommand(
      'driftViewer.suppressDiagnosticInFile',
      (args: IFileArgs) => suppressInFile(args),
    ),
    vscode.commands.registerCommand(
      'driftViewer.suppressDiagnosticAtCursor',
      () => suppressAtCursorColumn(),
    ),
    vscode.commands.registerCommand(
      'driftViewer.suppressDiagnosticAtCursorFile',
      () => suppressAtCursorFile(),
    ),
  );
}
