/**
 * Execute flow for the sidebar SQL console (plan 84, work package C).
 *
 * Split out of [./sql-console-view.ts](./sql-console-view.ts) so the provider file
 * stays inside the repo's 300-line limit: the provider owns webview lifecycle and
 * message routing, this file owns "what actually happens when Execute is pressed".
 *
 * THE TWO-ENDPOINT SPLIT IS THE CENTRAL FACT HERE. `POST /api/sql` is read-only and
 * hard-rejects anything that is not a single SELECT/WITH (SqlValidator.isReadOnlySql,
 * lib/src/server/sql_validator.dart). A mutation must therefore go to
 * `POST /api/edits/apply` as a ONE-ELEMENT batch, which additionally requires the
 * host app to have supplied a writeQuery callback. Sending a mutation to sql() would
 * not "mostly work" — it would be refused by the server every time.
 *
 * The classifier that picks between those two paths is a UI-side convenience only.
 * The server re-validates every statement and remains the sole authority on what is
 * allowed to run.
 */

import * as vscode from 'vscode';

import { DriftApiClient } from '../api-client';
import { t } from '../l10n';
import { maskCommentsAndLiterals, type SqlClassification } from '../sql/sql-classifier';
import { formatSingleCell, isSingleCell, rowsToCsv } from './sql-console-output';

/**
 * The server's result cap (ServerConstants.maxSqlResultRows). Mirrored, not
 * imported — it lives in Dart. See truncation handling below for why the console
 * needs to know it at all.
 */
const SQL_RESULT_ROW_CAP = 10_000;

/** Documentation shown when the host app has not enabled writes. */
const WRITE_DOCS_URL = 'https://drift.simonbinder.eu/docs/platforms/remote/';

/** Posts one already-localized message to the console webview. */
export type ConsolePost = (message: Record<string, unknown>) => void;

/**
 * Builds a client from the same `driftViewer.*` configuration keys the connection
 * bootstrap reads (extension-bootstrap.ts), which is the established way for a
 * surface that only holds the extension context to reach the server — see
 * tasks/health-check-runner.ts for the existing precedent.
 *
 * A fresh client per execution is deliberate: it costs nothing (the class is a thin
 * fetch wrapper with no sockets of its own) and it means a host/port/token change in
 * Settings takes effect on the very next Execute, with no listener to keep in sync.
 */
function createConsoleClient(): DriftApiClient {
  const cfg = vscode.workspace.getConfiguration('driftViewer');
  const host = cfg.get<string>('host', '127.0.0.1') ?? '127.0.0.1';
  const port = cfg.get<number>('port', 8642) ?? 8642;
  const client = new DriftApiClient(host, port);
  const token = cfg.get<string>('authToken', '') ?? '';
  // The client itself withholds the token from non-loopback hosts, so passing it
  // unconditionally here is safe and matches bootstrapExtension.
  if (token) client.setAuthToken(token);
  return client;
}

/** Error text from an unknown throwable, without leaking `[object Object]`. */
function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Best-effort extraction of the table a mutation targets, purely so the
 * confirmation prompt can name it. Returns undefined when the shape is not
 * recognized, and the caller then falls back to a prompt without a table name —
 * a wrong-looking guess in a destructive confirmation would be worse than none.
 */
function targetTable(sql: string): string | undefined {
  // Mask comments and quoted runs BEFORE regex extraction — the classifier
  // already decided this is a mutation using the masked form, but the table-name
  // regexes run a second, independent scan. Without masking, a table name inside
  // a comment (`UPDATE /* real_table */ other_table ...`) or a string literal
  // could match before the actual target. This was a review finding (2026-09-07).
  const masked = maskCommentsAndLiterals(sql);
  const patterns = [
    /\bupdate\s+(?:or\s+\w+\s+)?["'`[]?([\w$]+)/i, // UPDATE [OR REPLACE] t
    /\bdelete\s+from\s+["'`[]?([\w$]+)/i, // DELETE FROM t
    /\binto\s+["'`[]?([\w$]+)/i, // INSERT/REPLACE INTO t
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(masked);
    if (match) return match[1];
  }
  return undefined;
}

/**
 * True when the server clipped the result set.
 *
 * `DriftApiClient.sql()` normalizes the response down to `{columns, rows}` and drops
 * the envelope's `truncated` flag, so this reads the flag defensively (in case a
 * transport starts forwarding it) and otherwise falls back to "the row count landed
 * exactly on the server cap". The fallback can in principle fire on a result that
 * happens to be exactly 10,000 rows; over-warning about truncation is the harmless
 * direction, whereas presenting a clipped result as complete is a correctness trap.
 */
function isTruncated(result: { rows: unknown[][] }): boolean {
  const envelope = result as { truncated?: boolean };
  return envelope.truncated === true || result.rows.length >= SQL_RESULT_ROW_CAP;
}

/** The truncation banner text, or undefined when nothing was clipped. */
function truncationNotice(result: { rows: unknown[][] }): string | undefined {
  return isTruncated(result)
    ? t('panel.sqlConsole.result.truncated', SQL_RESULT_ROW_CAP)
    : undefined;
}

/**
 * Runs a read-only statement and routes the result: a strict 1x1 result renders
 * inline in the sidebar, everything else becomes a CSV document opened beside the
 * editor (Decision 4/5). The sidebar is far too narrow for a grid, so "open it where
 * there is room" is the routing rule rather than a fallback.
 */
async function runReadOnly(client: DriftApiClient, sql: string, post: ConsolePost): Promise<void> {
  const result = await client.sql(sql);
  const truncated = truncationNotice(result);

  if (isSingleCell(result.columns, result.rows)) {
    post({
      type: 'result',
      text: t(
        'panel.sqlConsole.result.singleCell',
        result.columns[0],
        formatSingleCell(result.rows[0][0]),
      ),
      emphasis: true,
      truncated,
    });
    return;
  }

  if (result.rows.length === 0) {
    // An empty result still deserves a stated outcome; opening a header-only CSV
    // document for it would be noise.
    post({ type: 'result', text: t('panel.sqlConsole.result.empty'), truncated });
    return;
  }

  const doc = await vscode.workspace.openTextDocument({
    content: rowsToCsv(result.columns, result.rows),
    language: 'csv',
  });
  await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
  post({
    type: 'result',
    text: t('panel.sqlConsole.result.opened', result.rows.length, result.columns.length),
    truncated,
  });
}

/**
 * Confirms a destructive statement with the repo's modal convention
 * (editing-commands.ts): `showWarningMessage(msg, { modal: true }, label)` compared
 * by string equality on the returned label. Dismissing the modal returns undefined,
 * which is correctly NOT equal to the label, so the default outcome is "do nothing".
 */
async function confirmDestructive(verb: string, sql: string): Promise<boolean> {
  const table = targetTable(sql);
  const message = table
    ? t('panel.sqlConsole.confirm.message', verb, table)
    : t('panel.sqlConsole.confirm.messageNoTable', verb);
  const label = t('panel.sqlConsole.confirm.execute');
  const choice = await vscode.window.showWarningMessage(message, { modal: true }, label);
  return choice === label;
}

/**
 * Checks the server's write gate before offering to mutate anything, mirroring
 * editing-commands.ts. Returns false after having explained why — never a silent
 * no-op, because a write that quietly does nothing reads as a bug in the database.
 */
async function ensureWritesEnabled(client: DriftApiClient, post: ConsolePost): Promise<boolean> {
  let writeEnabled = false;
  try {
    const health = await client.health();
    writeEnabled = health.writeEnabled === true;
  } catch (err: unknown) {
    const message = t('panel.sqlConsole.error.unreachable', errorText(err));
    post({ type: 'error', message });
    void vscode.window.showErrorMessage(message);
    return false;
  }
  if (writeEnabled) return true;

  const message = t('panel.sqlConsole.error.writesDisabled');
  post({ type: 'error', message });
  const docsLabel = t('panel.sqlConsole.error.writesDisabled.docs');
  void vscode.window.showWarningMessage(message, docsLabel).then((choice) => {
    if (choice === docsLabel) {
      void vscode.env.openExternal(vscode.Uri.parse(WRITE_DOCS_URL));
    }
  });
  return false;
}

/**
 * Runs a mutation through the batch-apply endpoint as a single-statement batch,
 * after the write gate and (when the setting is on) the modal confirmation.
 */
async function runMutation(
  client: DriftApiClient,
  sql: string,
  verb: string,
  askFirst: boolean,
  post: ConsolePost,
): Promise<void> {
  if (!(await ensureWritesEnabled(client, post))) return;
  if (askFirst && !(await confirmDestructive(verb, sql))) {
    // The user declined, which is a real outcome and gets stated as one.
    post({ type: 'result', text: t('panel.sqlConsole.error.cancelled') });
    return;
  }
  await client.applyEditsBatch([sql]);
  post({ type: 'result', text: t('panel.sqlConsole.result.applied', verb), emphasis: true });
}

/**
 * Executes one classified statement and reports the outcome to the webview.
 *
 * `askFirst` is the resolved `driftViewer.sqlConsole.confirmDestructive` value. It
 * is deliberately ignored on the read-only path: a SELECT modifies nothing no
 * matter how complex it is, so prompting for one would train the user to click
 * through the prompt that actually matters.
 */
export async function executeConsoleStatement(
  sql: string,
  classification: SqlClassification,
  askFirst: boolean,
  post: ConsolePost,
): Promise<void> {
  // The button is already disabled for these, but a stale webview or a keyboard
  // shortcut could still get here, so the host refuses rather than trusting it.
  if (!classification.executable) {
    // Verb passed for the reason messages that interpolate it ({0}); keys that
    // take no argument ignore it.
    post({ type: 'error', message: t(classification.reason, classification.verb) });
    return;
  }

  const client = createConsoleClient();
  post({ type: 'busy', value: true });
  try {
    if (classification.kind === 'readOnly') {
      await runReadOnly(client, sql, post);
    } else {
      await runMutation(client, sql, classification.verb, askFirst, post);
    }
  } catch (err: unknown) {
    const key =
      classification.kind === 'readOnly'
        ? 'panel.sqlConsole.error.query'
        : 'panel.sqlConsole.error.apply';
    post({ type: 'error', message: t(key, errorText(err)) });
  } finally {
    // Always clears busy, so a thrown request can never leave Execute stuck off.
    post({ type: 'busy', value: false });
  }
}
