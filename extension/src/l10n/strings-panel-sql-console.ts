/**
 * Host English source strings — sidebar SQL console family
 * ([../sql-console/sql-console-view.ts](../sql-console/sql-console-view.ts),
 * [../sql-console/sql-console-html.ts](../sql-console/sql-console-html.ts)),
 * plus the reason strings the shared classifier
 * ([../sql/sql-classifier.ts](../sql/sql-classifier.ts)) returns as l10n KEYS.
 * Plan 84, work package C.
 *
 * One registry slice per panel family (see `HOST_STRING_REGISTRIES` in
 * [../l10n.ts](../l10n.ts)). Each entry maps a SYMBOLIC KEY → its ENGLISH text;
 * call sites resolve the key through `t()` so the string reaches the translation
 * pipeline instead of shipping English from the call site.
 *
 * Runtime values (verbs, table names, row counts) are passed as `{0}`/`{1}`
 * tokens, never concatenated English — `vscode.l10n.t()` substitutes them, which
 * lets a translator reorder the sentence. SQL text and identifiers are rendered
 * from the source values directly and never translated.
 *
 * Why the classifier's reasons live HERE and not next to the classifier: package A
 * (`sql-classifier.ts`) is deliberately free of any `vscode` import so it stays
 * unit-testable, so it cannot call `t()`. It returns the KEY in its `reason` field
 * and the view resolves it. That split is the reason both families share one slice —
 * they are one feature, and keeping them together makes a missing key obvious.
 */

/** Symbolic key → English source text for the sidebar SQL console. */
export const stringsPanelSqlConsole: Record<string, string> = {
  // --- Classifier reasons (returned as keys by classifySql, resolved here) ---
  // A reason is shown next to the severity icon and, when the statement cannot
  // run, as the disabled Execute button's tooltip — so each one must name the
  // problem AND the corrective action, not just "invalid".
  // Key names below MUST match the strings `classifySql` puts in its `reason`
  // field verbatim (see the key inventory in the header of
  // `extension/src/sql/sql-classifier.ts`). The classifier cannot import `t()`,
  // so nothing type-checks this pairing — a rename on either side silently
  // degrades the UI to a raw key string. Change both files together.
  'sqlConsole.reason.empty': 'Enter a SQL statement to run.',
  'sqlConsole.reason.multiStatement':
    'Run one statement at a time. Remove everything after the first semicolon.',
  // {0} = the uppercased leading keyword, e.g. DROP. Covers DDL, PRAGMA, and
  // any unrecognized verb — one message, because the corrective action is the
  // same in every case and a verb-specific variant added nothing.
  'sqlConsole.reason.forbiddenStatement':
    'The server rejects {0} statements here. Use SELECT, WITH, INSERT, UPDATE, DELETE, or REPLACE.',
  // A permitted leading verb whose body still contains a forbidden keyword —
  // e.g. `WITH x AS (SELECT 1) INSERT INTO t ...`. Distinct from the above
  // because the leading verb looks fine, so naming it would mislead.
  'sqlConsole.reason.forbiddenKeyword':
    'This statement mixes in a keyword the server rejects. Keep it to a single read or a single write.',
  // A write verb missing its required clause, e.g. `INSERT t VALUES (1)`.
  // The useful hint here is "fix the syntax", not "not allowed".
  'sqlConsole.reason.malformedMutation':
    'Incomplete statement. INSERT and REPLACE need INTO, and DELETE needs FROM.',
  // {0} = the uppercased leading keyword, e.g. UPDATE.
  'sqlConsole.reason.mutation': 'Runs a {0} that changes stored data.',
  // Not emitted by the classifier (it returns an empty reason for a clean
  // read); the view substitutes this so the icon strip is never blank.
  'sqlConsole.reason.readOnly': 'Read-only query. Nothing is modified.',

  // --- Console shell (sql-console-html.ts) ---
  'panel.sqlConsole.sql.placeholder': 'SELECT * FROM users LIMIT 20',
  'panel.sqlConsole.sql.label': 'SQL statement',
  'panel.sqlConsole.btn.execute': 'Execute',
  'panel.sqlConsole.btn.execute.title': 'Run this statement against the connected database',
  'panel.sqlConsole.confirmDestructive.label': 'Warn before destructive changes',
  'panel.sqlConsole.confirmDestructive.title':
    'Ask for confirmation before running INSERT, UPDATE, DELETE, or REPLACE. SELECT never prompts.',
  'panel.sqlConsole.status.ready': 'Ready.',
  'panel.sqlConsole.status.running': 'Running statement…',

  // --- Severity icon strip (accessible labels for the three-tier vocabulary) ---
  'panel.sqlConsole.severity.info': 'Information',
  'panel.sqlConsole.severity.warning': 'Warning',
  'panel.sqlConsole.severity.error': 'Error',

  // --- Results ---
  // {0} = column name, {1} = the formatted single value.
  'panel.sqlConsole.result.singleCell': '{0}: {1}',
  // {0} = row count, {1} = column count. The CSV opened beside the editor.
  'panel.sqlConsole.result.opened': 'Opened {0} row(s) x {1} column(s) as CSV beside the editor.',
  'panel.sqlConsole.result.empty': 'Query returned no rows.',
  // {0} = the uppercased verb that was applied, e.g. UPDATE.
  'panel.sqlConsole.result.applied': 'Applied the {0} statement in one transaction.',
  // Shown whenever the server clipped the result. Deliberately blunt: a silently
  // clipped result set reads as a complete answer and is a correctness trap.
  // {0} = the server's row cap.
  'panel.sqlConsole.result.truncated':
    'TRUNCATED — the server returned only the first {0} rows. Add a LIMIT or a narrower WHERE to see the rest.',

  // --- Errors and gates ---
  // {0} = the underlying error text from the server or transport.
  'panel.sqlConsole.error.query': 'Query failed: {0}',
  'panel.sqlConsole.error.apply': 'Statement failed: {0}',
  // {0} = the underlying error text.
  'panel.sqlConsole.error.unreachable': 'Could not reach the Drift debug server: {0}',
  'panel.sqlConsole.error.writesDisabled':
    'Writes are not enabled on this server. Pass a writeQuery callback to DriftDebugServer.start(), restart the app, then retry.',
  'panel.sqlConsole.error.writesDisabled.docs': 'View Docs',
  'panel.sqlConsole.error.cancelled': 'Statement cancelled. Nothing ran.',
  // {0} = the underlying error text. Surfaced because a checkbox that silently
  // fails to save would keep promising a confirmation that will not appear.
  'panel.sqlConsole.error.settingWriteFailed':
    'Could not save the confirmation preference: {0}',

  // --- Destructive-change confirmation (modal) ---
  // {0} = the uppercased verb, {1} = the target table name.
  'panel.sqlConsole.confirm.message':
    'Run this {0} against "{1}"? It changes stored data and cannot be undone from the extension.',
  // Used when the target table could not be parsed out of the statement.
  // {0} = the uppercased verb.
  'panel.sqlConsole.confirm.messageNoTable':
    'Run this {0}? It changes stored data and cannot be undone from the extension.',
  'panel.sqlConsole.confirm.execute': 'Execute',

  // --- Query history (collapsible list below the output area) ---
  // {0} = number of saved queries. Always shown, even at zero.
  'panel.sqlConsole.history.label': 'History ({0})',
  'panel.sqlConsole.history.clear': 'Clear',
  'panel.sqlConsole.history.empty': 'No queries yet.',
};
