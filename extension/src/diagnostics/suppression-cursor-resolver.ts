/**
 * Resolves which Drift Advisor diagnostic the user means from the active
 * editor's cursor position. Split out of suppression-commands.ts.
 */

import * as vscode from 'vscode';
import { DIAGNOSTIC_SOURCE } from './diagnostic-types';

/**
 * Lines above/below the cursor still counted as "near" for both the
 * cursor-resolution fallback and the editor-context menu's visibility check.
 * Shared so the menu never shows for a position the resolver would then
 * refuse (or vice versa).
 */
export const NEAR_CURSOR_LINE_WINDOW = 3;

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
export async function resolveDiagnosticAtCursor(): Promise<
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

    // The QuickPick await is the one real gap where the document can change
    // underneath the pick (edit, save-triggered refresh, or a background
    // diagnostics sweep) — the `chosen` object is a snapshot from before the
    // user answered. Re-read current diagnostics and require a same
    // (code, line) match before acting, so a stale pick can't insert a
    // directive at a line the finding no longer occupies.
    const stillPresent = vscode.languages
      .getDiagnostics(document.uri)
      .some(
        (d) =>
          d.source === DIAGNOSTIC_SOURCE &&
          d.code === chosen.code &&
          d.range.start.line === chosen.range.start.line,
      );
    if (!stillPresent) {
      vscode.window.showWarningMessage(
        'This finding changed before the pick was confirmed — run the command again.',
      );
      return undefined;
    }
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
