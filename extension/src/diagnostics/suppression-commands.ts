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
 *    same line or not (see suppression-cursor-resolver.ts). The fallback is
 *    bounded by the same window the right-click menu's visibility uses, so a
 *    menu click and a Command Palette invocation always resolve consistently.
 *
 * One additional hardening note for future edits:
 * - `onDidChangeDiagnostics` fires for every extension's diagnostics in
 *   every open document, so the listener filters the event's `uris` down to
 *   the active editor's document before doing any work — see
 *   `scheduleContextUpdateIfActiveDocAffected`.
 */

import * as vscode from 'vscode';
import { DIAGNOSTIC_SOURCE } from './diagnostic-defaults';
import {
  IColumnArgs,
  IFileArgs,
  setRefreshCallback,
  suppressInColumn,
  suppressInFile,
} from './suppression-edit-ops';
import {
  NEAR_CURSOR_LINE_WINDOW,
  resolveDiagnosticAtCursor,
} from './suppression-cursor-resolver';

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
  setRefreshCallback(refresh);

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
  // `onDidChangeDiagnostics` fires for every extension's diagnostics in
  // every open document, not just Drift Advisor's or the active editor's —
  // in a large multi-extension workspace that can be frequent. The event
  // carries the affected `uris`, so skip the recompute entirely unless one
  // of them is the active editor's document; nothing else could change
  // `hasFindingNearCursor`.
  const scheduleContextUpdateIfActiveDocAffected = (e: vscode.DiagnosticChangeEvent): void => {
    const activeUri = vscode.window.activeTextEditor?.document.uri.toString();
    if (activeUri !== undefined && e.uris.some((u) => u.toString() === activeUri)) {
      scheduleContextUpdate();
    }
  };

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(updateHasFindingNearCursorContext),
    vscode.window.onDidChangeTextEditorSelection(scheduleContextUpdate),
    vscode.languages.onDidChangeDiagnostics(scheduleContextUpdateIfActiveDocAffected),
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
