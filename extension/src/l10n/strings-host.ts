/**
 * Extension-host English source strings (System B, host surface) — plan 75 §3.1.
 *
 * Single source of truth for user-facing strings the EXTENSION HOST renders at
 * runtime: `showInformationMessage` / `showErrorMessage` bodies, QuickPick titles
 * and placeholders, input-box prompts, and host-built panel HTML
 * (`extension/src/**\/*-html.ts`). Each entry maps a SYMBOLIC KEY → its ENGLISH
 * text; render code resolves the key via `t()` ([../l10n.ts](../l10n.ts)).
 *
 * This is distinct from the MANIFEST strings (command titles, settings,
 * walkthrough) which live in `package.nls.json` and are referenced as `%key%` —
 * that is System A (plan 75 §2), handled by VS Code itself, not by `t()`.
 *
 * WHY a registry: a hardcoded host string never reaches the translation pipeline.
 * Declaring it here and rendering via `t('key')` is what lets the toolchain
 * extract → translate → overlay it through `vscode.l10n`.
 *
 * Use `{0}`, `{1}` placeholders for runtime values (`vscode.l10n.t` substitutes
 * them) — never English concatenation, which a translator cannot reorder. Keep
 * the file under the 300-line limit; extract `strings-panel-*.ts` slices per panel
 * family as it grows, and register them in `HOST_STRING_REGISTRIES` in
 * [../l10n.ts](../l10n.ts).
 *
 * SCOPE NOTE: framework seed, not the full sweep (plan 75 Phase 3). A handful of
 * real keys establish the convention; the bulk migration of host call sites and
 * `*-html.ts` panels follows.
 */

/** Symbolic key → English source text for extension-host UI. */
export const hostStrings: Record<string, string> = {
  // --- Connection / discovery notifications ---
  'host.msg.serverConnected': 'Connected to Drift debug server at {0}',
  'host.msg.serverDisconnected': 'Drift debug server disconnected',
  'host.msg.noServerFound': 'No Drift debug server found',

  // --- Common command feedback ---
  'host.msg.tableNameCopied': 'Copied table name: {0}',
  'host.msg.columnNameCopied': 'Copied column name: {0}',
  'host.msg.sqlCopied': 'Suggested SQL copied to clipboard',

  // --- QuickPick / dialog chrome ---
  'host.pick.selectServer.title': 'Select a Drift debug server',
  'host.pick.selectServer.placeholder': 'Pick the running app to connect to',
  'host.dialog.discardEdits.confirm': 'Discard all pending edits?',
  'host.dialog.discardEdits.ok': 'Discard',
  'host.dialog.cancel': 'Cancel',
};
