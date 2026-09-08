/**
 * Drift Advisor extension entry point.
 *
 * Activation is split into isolated **phases**, each wrapped in its own
 * try/catch. If one phase throws, the error is logged and surfaced via
 * toast — but later phases still run so commands registered by surviving
 * phases remain functional. The outer activate() **never re-throws**:
 * re-throwing causes VS Code to dispose ALL registered commands, turning
 * every sidebar button into "command not found".
 *
 * Phase sequence:
 *   0  Output channel (cannot fail — created before anything else)
 *   1  Bootstrap (client, discovery, watcher, serverManager)
 *   2  About commands (zero-dependency sidebar icons)
 *   3  Schema cache + cached client
 *   4  Providers (tree, tools, codeLens, hover, linter, SQL Console view, etc.)
 *   5  Intelligence engines (schema, query)
 *   6  Diagnostics
 *   7  Editing (change tracker, FK navigator, pending edits)
 *   8  Status bars + UI wiring
 *   9  Command registration (registerAllCommands)
 *  10  Event listeners + initial state
 *
 * The phase bodies themselves (phases 1–7) live in extension-activate-inner.ts
 * — extracted to keep this file under the line cap. This file keeps only the
 * public entry point and its top-level safety net.
 */

import * as vscode from 'vscode';
import type { DriftAdvisorApi } from './log-capture-api';
import { ts } from './extension-phase-utils';
import { activateInner } from './extension-activate-inner';

// --- Public entry point ---
/**
 * Extension activation. Creates an output channel first, then delegates to
 * {@link activateInner} for phased setup. The outer try/catch is a safety
 * net for anything that escapes the per-phase isolation — it **never
 * re-throws** so that VS Code does not dispose already-registered commands.
 */
export function activate(context: vscode.ExtensionContext): DriftAdvisorApi | undefined {
  // Phase 0: Output channel — created before everything else so every
  // subsequent phase can log to it. Cannot meaningfully fail.
  const channel = vscode.window.createOutputChannel('Saropa Drift Advisor');
  context.subscriptions.push(channel);
  channel.appendLine(`[${ts()}] Saropa Drift Advisor activating...`);

  try {
    return activateInner(context, channel);
  } catch (err: unknown) {
    // Safety net for any error that escaped per-phase isolation.
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack ?? '' : '';
    void vscode.window.showErrorMessage(
      `Saropa Drift Advisor failed to activate: ${msg}`,
    );
    channel.appendLine(`[${ts()}] FATAL unhandled error: ${msg}\n${stack}`);
    // Log to Extension Host console so developers can find it in
    // Output → Extension Host even if the Saropa channel is not open.
    console.error('[Saropa Drift Advisor] Activation failed:', msg, '\n', stack);
    // DO NOT re-throw. Re-throwing causes VS Code to mark the extension
    // as failed and dispose ALL registered commands — even those from
    // earlier phases that completed successfully. The tree view survives
    // (it is a UI element) but every command becomes "command not found".
    return undefined;
  }
}

/** Called when the extension is deactivated. */
export function deactivate(): void {
  return;
}
