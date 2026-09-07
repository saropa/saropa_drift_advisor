/**
 * Sidebar SQL console — the `vscode.WebviewViewProvider` behind the
 * `driftViewer.sqlConsole` view (plan 84, work package C).
 *
 * WHY A WEBVIEW VIEW AND NOT A TREE: every other sidebar surface in this extension
 * is a `TreeDataProvider`, which cannot host a textarea, a button, or a checkbox.
 * This is the first webview-typed view in the container; the closest existing
 * reference is the full SQL Notebook PANEL, scaled down to one column.
 *
 * This file owns webview lifecycle and message routing only. The execute flow lives
 * in [./sql-console-execute.ts](./sql-console-execute.ts), the markup in
 * [./sql-console-html.ts](./sql-console-html.ts) — the split keeps each file inside
 * the repo's 300-line limit.
 *
 * VALIDATION IS COMPUTED HERE, not in the webview. The webview debounces keystrokes
 * 300 ms and sends an `input` message; this provider runs the one shared
 * `classifySql()` and pushes a `validation` message back. Duplicating the classifier
 * into the webview script would let the two drift apart, and the icon the user reads
 * would eventually disagree with the gate that actually blocks Execute.
 */

import * as vscode from 'vscode';

import { t } from '../l10n';
import { classifySql, type SqlClassification } from '../sql/sql-classifier';
import { secureWebviewHtml } from '../webview-csp';
import { executeConsoleStatement, type ConsolePost } from './sql-console-execute';
import { getSqlConsoleHtml } from './sql-console-html';

/** Configuration section and key for the confirm-before-destructive setting. */
const CONFIG_SECTION = 'driftViewer.sqlConsole';
const CONFIRM_DESTRUCTIVE_KEY = 'confirmDestructive';

/** Fully qualified form, for `affectsConfiguration` and `update()`. */
const CONFIRM_DESTRUCTIVE_SETTING = `${CONFIG_SECTION}.${CONFIRM_DESTRUCTIVE_KEY}`;

/** Messages the webview can send. Anything else is ignored. */
interface ConsoleMessage {
  type?: string;
  sql?: string;
  value?: boolean;
}

/** Reads the confirm-before-destructive setting. Defaults ON — see plan Decision 2. */
function readConfirmDestructive(): boolean {
  return (
    vscode.workspace
      .getConfiguration(CONFIG_SECTION)
      .get<boolean>(CONFIRM_DESTRUCTIVE_KEY, true) !== false
  );
}

/**
 * Resolves a classification's `reason` for display.
 *
 * The classifier is `vscode`-free by design, so it cannot localize; it returns an
 * l10n KEY and this is where the key becomes text. `readOnly` carries an empty
 * reason per its contract, but the icon strip would then show a lone glyph with
 * nothing beside it, so the reassuring "nothing is modified" line is supplied here.
 */
function reasonText(classification: SqlClassification): string {
  // Two of the reason messages interpolate the leading keyword ({0}), and the
  // rest ignore extra args, so the verb is passed unconditionally rather than
  // branching per key — one less place to update when a message gains a verb.
  if (classification.reason) return t(classification.reason, classification.verb);
  return classification.kind === 'readOnly' ? t('sqlConsole.reason.readOnly') : '';
}

/** Sidebar SQL console view provider. */
export class SqlConsoleViewProvider implements vscode.WebviewViewProvider {
  /** Must match the `contributes.views` id in package.json (owned by package D). */
  static readonly viewType = 'driftViewer.sqlConsole';

  /** The resolved view, or undefined while the sidebar section has never been opened. */
  private _view: vscode.WebviewView | undefined;

  /**
   * Takes only the extension context: the console reaches the server through a
   * client built from `driftViewer.*` settings at execute time (see
   * sql-console-execute.ts), so it needs no injected connection state and can be
   * registered before, or independently of, the connection layer.
   */
  constructor(private readonly _context: vscode.ExtensionContext) {
    // Keep the checkbox honest when the setting is changed anywhere else — the
    // Settings UI, a settings.json edit, or another window. Without this the
    // checkbox would keep showing whatever it was rendered with.
    this._context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration(CONFIRM_DESTRUCTIVE_SETTING)) {
          this._post({ type: 'confirmDestructive', value: readConfirmDestructive() });
        }
      }),
    );
  }

  /**
   * Builds the webview the first time the sidebar section is expanded, and again
   * after VS Code disposes it while hidden.
   */
  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this._view = webviewView;
    // Scripts are required (the console is interactive); no localResourceRoots are
    // granted because the HTML is fully self-contained — no file:// asset is loaded.
    webviewView.webview.options = { enableScripts: true };
    // secureWebviewHtml stamps the per-render nonce onto the one script marked with
    // __CSP_NONCE__ and injects `default-src 'none'`, so any markup that ever
    // reaches the DOM carrying a <script> is inert rather than executable.
    webviewView.webview.html = secureWebviewHtml(getSqlConsoleHtml(readConfirmDestructive()));

    webviewView.webview.onDidReceiveMessage(
      (message: ConsoleMessage) => this._handleMessage(message),
      undefined,
      this._context.subscriptions,
    );

    // A disposed-and-rebuilt view starts from a fresh DOM, so drop the stale
    // handle rather than posting into a dead webview.
    webviewView.onDidDispose(
      () => {
        if (this._view === webviewView) this._view = undefined;
      },
      undefined,
      this._context.subscriptions,
    );
  }

  /** Posts to the webview if one exists; a no-op while the section is unresolved. */
  private readonly _post: ConsolePost = (message) => {
    void this._view?.webview.postMessage(message);
  };

  /** Routes one webview message. Unknown types are ignored, never thrown on. */
  private _handleMessage(message: ConsoleMessage): void {
    switch (message.type) {
      case 'input':
        this._validate(message.sql ?? '');
        break;
      case 'execute':
        void this._execute(message.sql ?? '');
        break;
      case 'setConfirmDestructive':
        void this._setConfirmDestructive(message.value === true);
        break;
      default:
        // Deliberately silent: an unrecognized message is a version mismatch
        // between host and webview, not a condition the user can act on.
        break;
    }
  }

  /** Classifies the current text and pushes the severity/reason back for the icon strip. */
  private _validate(sql: string): void {
    const classification = classifySql(sql);
    this._post({
      type: 'validation',
      classification: {
        kind: classification.kind,
        severity: classification.severity,
        verb: classification.verb,
        executable: classification.executable,
        // Sent pre-localized: the webview never resolves l10n keys itself.
        reason: reasonText(classification),
      },
    });
  }

  /**
   * Re-classifies before executing rather than trusting the webview's last verdict.
   * The webview's copy can be stale (a keystroke that landed inside the debounce
   * window), and the difference between the two verdicts is the difference between
   * a read and a write.
   */
  private async _execute(sql: string): Promise<void> {
    const classification = classifySql(sql);
    await executeConsoleStatement(sql, classification, readConfirmDestructive(), this._post);
  }

  /**
   * Writes the checkbox back to the real setting, Global scope so the preference
   * follows the developer across every workspace (Decision 2). Reported on failure
   * instead of leaving the checkbox showing a value that was never saved.
   */
  private async _setConfirmDestructive(value: boolean): Promise<void> {
    try {
      await vscode.workspace
        .getConfiguration()
        .update(CONFIRM_DESTRUCTIVE_SETTING, value, vscode.ConfigurationTarget.Global);
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      this._post({
        type: 'error',
        message: t('panel.sqlConsole.error.settingWriteFailed', detail),
      });
      // Roll the checkbox back so the UI matches what is actually stored.
      this._post({ type: 'confirmDestructive', value: readConfirmDestructive() });
    }
  }
}
