**Status: BUILT — awaiting manual device verification.** All five work packages
landed; `npm run compile` (tsc + both NLS gates) and the full extension suite
pass. The manual checklist at the bottom has NOT been run — no connected server
was available in the build session, so end-to-end behavior is unverified.

Post-build corrections recorded in-place below: the ten-locale NLS assumption
was wrong (§ Work Package D), and three of the built packages deviated from
their contracts in ways that were kept — see § Deviations kept.

## Deviations kept

1. **Classifier is stricter than the plan's requirement 3.** Leading
   `SELECT`/`WITH` alone does not earn `readOnly`; the server's 14-keyword
   whole-word scan was ported too, so
   `WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x` is `forbidden`. Taken
   literally, the plan would have enabled Execute for a statement `/api/sql`
   then rejects — the exact round trip the classifier exists to prevent.
   Mutation verbs likewise require their clause (`INSERT`/`REPLACE` need
   `INTO`, `DELETE` needs `FROM`), reported as a distinct
   "malformed" reason so the hint is "fix the syntax", not "not allowed".
2. **A fifth file, `sql-console-execute.ts`**, splits the execute flow out of
   the view to hold the ~300-line ceiling.
3. **CSV ends with a trailing newline**, and plain strings are never sniffed as
   base64 — a TEXT column legitimately holding base64-looking text would
   otherwise be silently replaced with `<N bytes>`, which is data loss.

## Known follow-up

`DriftApiClient.sql()` normalizes the server response to `{columns, rows}` and
**drops the envelope's `truncated`/`rowCount` fields**
(`extension/src/api-client-http-query.ts:111-112`). The console therefore
infers truncation from a row count at the server's cap, which over-warns at
exactly-cap results. The clean fix is to forward `truncated` through
`httpSql` — deliberately not done here, since `api-client.ts` is shared with
other consumers and was out of scope for this work.

# SQL console in the sidebar

## Motivation

The extension already has a full SQL Notebook **panel**
(`extension/src/sql-notebook/*`, opened as a separate editor-column webview)
with a textarea, Execute/Explain/NL-to-SQL/chart buttons, autocomplete, and
history. What it does not have is a lightweight, always-visible SQL box
docked in the sidebar tree view for quick ad-hoc queries without opening a
full panel. This plan adds that sidebar surface.

Requested behavior (from the user):

- New sidebar section: SQL text box + an Execute button underneath it.
- Automatic validation as the query is edited, surfaced as severity icons
  (not just a pass/fail).
- A checkbox, **on by default**, that warns before destructive changes
  (INSERT/UPDATE/DELETE) with an "Are you sure…" confirmation. SELECT
  statements — even complex ones — are always safe and never prompt.
- Output handling: a table result (more than one row/column) is written to a
  file and opened; a single-cell result is shown inline. Leaning CSV over
  JSON for the file format ("json may be overkill, csv may be too limiting —
  but probably not").

## Existing code this must fit into (facts gathered before drafting)

- **Sidebar is TreeDataProvider-only today.** All four sidebar views
  (`driftViewer.toolbox`, `driftViewer.databaseExplorer`,
  `driftViewer.pendingChanges`, `driftViewer.queryPerformance`) are
  `vscode.TreeDataProvider` implementations
  (`extension/src/tree/*`, `extension/src/editing/pending-changes-provider.ts`,
  `extension/src/debug/performance-tree-provider.ts`). A tree view cannot host
  a textarea or checkbox. **This feature requires a new
  `vscode.WebviewViewProvider`** registered against a new
  `contributes.views.driftViewer` entry in `extension/package.json`, wired in
  extension-main.ts alongside the other providers (activation phase 5, per
  the 11-phase contract in the architecture-contract skill — must not throw
  on registration failure). There is no existing sidebar webview-view example
  in this codebase to copy; the closest reference is the full-panel webview
  in `extension/src/panel.ts` / `extension/src/sql-notebook/sql-notebook-html.ts`,
  scaled down.
- **Read path**: `POST /api/sql` is read-only, enforced server-side by
  `SqlValidator.isReadOnlySql` (`lib/src/server/sql_validator.dart:200`) —
  it rejects anything that isn't a single `SELECT`/`WITH` statement. Request
  body `{"sql": "...", "internal"?: bool, "args"?, "namedArgs"?}`; response
  `{"rows": [{col: val, ...}, ...]}` (object-rows), or `{"rowCount", "truncated": true}`
  when clipped at `ServerConstants.maxSqlResultRows`, or `{"error": "..."}`.
  Client wrapper: `DriftApiClient.sql()` (`extension/src/api-client.ts:135-156`).
- **Write path is a different endpoint.** `POST /api/edits/apply`
  (`lib/src/server/edits_batch_handler.dart`) takes
  `{"statements": ["UPDATE ...", ...]}`, validates each with
  `SqlValidator.isSingleDataMutationSql` (`sql_validator.dart:261`), and runs
  them in one transaction. It requires the host app to have supplied a
  `writeQuery` callback — the extension must check `health.writeEnabled`
  first, exactly as `editing-commands.ts:152-167` does before offering its
  own apply action. Client wrapper: `DriftApiClient.applyEditsBatch(statements)`
  (`api-client.ts:162-168`). **A single mutation typed into the new SQL box
  goes here as a 1-element array — `/api/sql` will simply reject it.**
- **No TypeScript SQL classifier exists yet.** All read-only/mutation/DDL
  classification today is server-side Dart only
  (`SqlValidator.isReadOnlySql` / `isSingleDataMutationSql` /
  `isSingleCreateIndexSql`, `sql_validator.dart:200/261/314`). For the
  "automatic validation with severity icons" requirement to react as the user
  types, without a round-trip per keystroke, a lightweight TS-side classifier
  is needed purely for UI feedback — **the server remains the sole
  authority** for what is actually allowed to execute (mirrors the existing
  "server never trusts the client" posture: identifiers are re-quoted
  server-side, SQL is re-validated server-side even though the extension
  already knows the schema).
- **Confirmation-dialog convention**: `vscode.window.showWarningMessage(msg, { modal: true }, 'Apply')`
  compared by string equality on the returned button label
  (`extension/src/editing/editing-commands.ts:187-192`). Reuse this exact
  pattern for the "Are you sure…" prompt.
- **File-output convention**: no reusable "write temp file + open" helper
  exists yet. Two precedents in `extension/src/export/export-commands.ts`:
  `showSaveDialog` + `vscode.workspace.fs.writeFile` (user picks a real path,
  line ~36), or `vscode.workspace.openTextDocument({content, language})` +
  `vscode.window.showTextDocument(doc, ViewColumn.Beside)` for a virtual,
  unsaved document (line ~151). The virtual-document route matches "opened"
  without forcing a save-location prompt on every query and is the better
  fit here — see open question below.
- **Severity/icon convention**: diagnostics map string severities to
  `vscode.DiagnosticSeverity` in `extension/src/diagnostics/diagnostic-config.ts:12-24`,
  with a label mapping in `extension/src/diagnostics/rules-config-panel.ts:50-58`.
  The new validation icons should reuse the same three-tier vocabulary
  (Error / Warning / Information) and, ideally, the same codicons
  (`$(error)`, `$(warning)`, `$(info)`) already used elsewhere in the
  extension's webviews for visual consistency.

## Proposed design

1. **New view**: `driftViewer.sqlConsole`, a `WebviewViewProvider`, placed in
   the same `driftViewer` sidebar container, above or below
   `databaseExplorer` (placement TBD — see open questions).
2. **Webview contents**: a `<textarea>` for SQL entry, an Execute button
   directly underneath it, a small icon strip for live validation feedback,
   and the "warn before destructive changes" checkbox (default checked,
   persisted — see open questions on where).
3. **Live validation** (client-side, debounced ~300ms after the last
   keystroke, same debounce family as the schema-cache TTL work):
   - New `extension/src/sql/sql-classifier.ts` — a small TS port of the
     read-only/mutation/DDL/multi-statement checks (does not need the exact
     tokenizer state machine from `sql_validator.dart`, since it's UI
     hinting, not enforcement, but should not diverge so far that it commonly
     disagrees with the server's verdict).
   - Icon mapping: SELECT/WITH → info ("read-only, safe"); single
     INSERT/UPDATE/DELETE/REPLACE → warning ("will modify data"); anything
     forbidden server-side (DDL, PRAGMA, multi-statement, empty) → error,
     Execute button disabled with a tooltip naming the reason.
4. **Execute flow**:
   - Empty or error-classified query → Execute stays disabled; no request.
   - Read-only → call `DriftApiClient.sql()` directly, no confirmation
     regardless of checkbox state (per the user's explicit "SELECT
     statements — even complex ones, are safe").
   - Mutation → if the checkbox is checked, show the modal confirmation
     (`editing-commands.ts` pattern) naming the statement type before
     calling `DriftApiClient.applyEditsBatch([sql])`; if unchecked, call it
     directly. Gate on `health.writeEnabled` first and show an explanatory
     message (not a silent no-op) if writes are disabled, mirroring
     `editing-commands.ts:152-167`.
5. **Output handling**:
   - Mutation results (row-count/affected-rows) render inline in the sidebar
     — never file output, there's no "table" to speak of.
   - SELECT results: if the result is exactly one row and one column, render
     the value inline in the sidebar webview. Otherwise, serialize to CSV and
     open it as a virtual, unsaved document beside the current editor
     (`openTextDocument({content, language: 'csv'})` +
     `showTextDocument(..., ViewColumn.Beside)`), matching the existing
     export-commands.ts precedent instead of introducing a new
     temp-file-on-disk mechanism.
   - CSV generation needs a documented convention for NULL, embedded commas,
     quotes, newlines, and BLOB columns (server already returns BLOBs
     length-projected in sweep paths, but `/api/sql` on an ad-hoc user query
     can still return raw BLOB bytes/base64 — needs a defined display
     fallback, e.g. `<N bytes>`, rather than dumping binary into a CSV cell).

## Decisions (settled — build to these)

1. **Placement**: new view `driftViewer.sqlConsole`, declared in the
   `driftViewer` sidebar container immediately after `driftViewer.toolbox`
   and before `driftViewer.databaseExplorer` — it is a quick-action surface,
   so it belongs near the top. `"visibility": "visible"`, `"type": "webview"`.
   It does not replace the toolbox.
2. **Checkbox persistence**: a real setting,
   `driftViewer.sqlConsole.confirmDestructive` (boolean, default `true`), in
   `extension/package.json` `contributes.configuration`. Discoverable in the
   Settings UI and consistent with every other `driftViewer.*` key. The
   webview checkbox reads it on render and writes it back via
   `workspace.getConfiguration().update(..., ConfigurationTarget.Global)`.
3. **Relationship to the SQL Notebook panel**: separate, minimal
   implementation in a new `extension/src/sql-console/` module. The Notebook
   panel is **not** refactored as part of this work (blast radius; it is a
   working shipped surface). The only shared code is the new classifier
   (work package A), which the Notebook may adopt later. No
   "promote to notebook" affordance in v1.
4. **Output format**: CSV only, no JSON option. Conventions, fixed:
   - Header row of column names, always.
   - Field separator `,`; line terminator `\n`.
   - A field is quoted (`"`) if and only if it contains `,`, `"`, `\n`, or
     `\r`; embedded `"` is escaped by doubling.
   - SQL `NULL` → empty unquoted field. An empty **string** → `""` (quoted),
     so the two remain distinguishable.
   - BLOB / non-primitive values → the literal placeholder `<N bytes>` where
     N is the byte length when derivable, else `<blob>`. Binary is never
     written into a CSV cell.
5. **Single-cell threshold**: strictly 1 row × 1 column. Anything else — a
   1-row multi-column result included — goes to the CSV document.
6. **Live-validation trust boundary**: yes, a best-effort TS classifier is
   acceptable. It drives icons and the Execute button's enabled state only;
   the server re-validates and is the final authority. The classifier must
   never be described in code comments or UI copy as a security boundary.
7. **Module layout**: new `extension/src/sql-console/` directory following the
   `sql-notebook/` file-splitting pattern, registered from
   `extension/src/extension-main.ts` phase 5 (providers) under `runPhase`, so
   a registration failure cannot abort activation.

## Work packages

These are written as contracts so they can be built in parallel. Each package
owns its files exclusively; no package edits another's files.

### A — SQL classifier (pure logic, no `vscode` import)

File: `extension/src/sql/sql-classifier.ts` (+ unit tests in
`extension/src/test/sql-classifier.test.ts`).

```ts
export type SqlKind = 'empty' | 'readOnly' | 'mutation' | 'forbidden';
export type SqlSeverity = 'info' | 'warning' | 'error';

export interface SqlClassification {
  kind: SqlKind;
  severity: SqlSeverity;   // readOnly->info, mutation->warning, forbidden/empty->error
  /** Human-readable, l10n-key-backed reason; '' when kind is readOnly. */
  reason: string;
  /** Uppercased leading keyword (SELECT, WITH, UPDATE, ...), '' when empty. */
  verb: string;
  /** True only when kind === 'readOnly' or 'mutation'. */
  executable: boolean;
}

export function classifySql(sql: string): SqlClassification;
```

Behavior, mirroring `lib/src/server/sql_validator.dart` closely enough to
rarely disagree: mask comments (`--`, `/* */`) and quoted runs (`'`, `"`,
backtick, `[]`) before keyword scanning; reject anything after the first `;`
(multi-statement → `forbidden`); `SELECT`/`WITH` leading → `readOnly`;
single leading `INSERT`/`UPDATE`/`DELETE`/`REPLACE` → `mutation`; anything
else, including DDL and `PRAGMA`, → `forbidden`.

### B — CSV serialization + result routing (no `vscode` UI, one thin seam)

File: `extension/src/sql-console/sql-console-output.ts` (+ tests in
`extension/src/test/sql-console-output.test.ts`).

```ts
/** Serializes a columnar result to CSV per the conventions in Decision 4. */
export function rowsToCsv(columns: string[], rows: unknown[][]): string;

/** True when the result is exactly 1x1 and should render inline instead. */
export function isSingleCell(columns: string[], rows: unknown[][]): boolean;

/** Formats a 1x1 value for inline display (NULL -> 'NULL', blob -> '<N bytes>'). */
export function formatSingleCell(value: unknown): string;
```

The `openTextDocument`/`showTextDocument` call itself stays in package C so
this file remains unit-testable without the vscode mock.

### C — Webview view provider + execute flow (owns the `vscode` surface)

Files: `extension/src/sql-console/sql-console-view.ts` (provider + message
handling + execute flow), `sql-console-html.ts` (markup), `sql-console-js.ts`
(webview-side script), `sql-console-styles.ts` (CSS). Keep each under ~300
lines, matching repo discipline.

Requirements:

- `implements vscode.WebviewViewProvider`; `resolveWebviewView` sets
  `webview.options = { enableScripts: true }` and applies the same CSP
  hardening used by `secureWebviewHtml` for the other panels.
- Webview → extension messages: `{type:'execute', sql}`,
  `{type:'setConfirmDestructive', value}`. Extension → webview:
  `{type:'validation', classification}`, `{type:'result', ...}`,
  `{type:'error', message}`, `{type:'busy', value}`.
- Validation is computed **extension-side** on each `input` message
  (debounced 300 ms in the webview) via `classifySql` from package A, and
  pushed back as a `validation` message — keeps one classifier, no duplicate
  logic inside the webview script.
- Execute flow exactly as "Proposed design §4" above: `readOnly` →
  `DriftApiClient.sql()`; `mutation` → check `health.writeEnabled` first
  (explanatory message if disabled, never a silent no-op), then, when
  `driftViewer.sqlConsole.confirmDestructive` is true, the modal
  `showWarningMessage(..., { modal: true }, 'Execute')` prompt naming the
  verb and target, then `DriftApiClient.applyEditsBatch([sql])`.
- Result routing: `isSingleCell` → post inline to the webview; otherwise
  `rowsToCsv` → `openTextDocument({content, language: 'csv'})` +
  `showTextDocument(doc, vscode.ViewColumn.Beside)`. Surface the server's
  `truncated` flag visibly when set — a silently clipped result is a
  correctness trap.
- Every user-visible string goes through `t()` from `extension/src/l10n.ts`
  with keys added to the appropriate `extension/src/l10n/strings-*.ts`
  registry. No hardcoded English at a call site.

### D — Manifest, settings, NLS, activation wiring

Files: `extension/package.json`, `extension/package.nls.json` (+ every
`package.nls.<locale>.json`), `extension/src/extension-main.ts`.

- `contributes.views.driftViewer`: new `{ "id": "driftViewer.sqlConsole",
  "name": "%driftViewer.view.sqlConsole.title%", "type": "webview" }` in the
  position from Decision 1.
- `contributes.configuration`: `driftViewer.sqlConsole.confirmDestructive`,
  boolean, default `true`, `%...description%` NLS key.
- Add every new `%key%` to `package.nls.json` — `npm run verify-nls` fails the
  compile otherwise, in both directions (missing AND orphan keys).
  **Correction to an earlier assumption:** this repo has NO translated locale
  bundles. `package.nls.json` is the only bundle on disk; `verify-nls.mjs`
  discovers bundles by directory scan, so it checks the English base alone and
  `nls-coverage.mjs` reports "English-only". The ten-locale set described in
  the docs-and-writing skill does not exist in the working tree.
- Key naming follows house convention: views use `view.<id>.name` (matching
  `view.toolbox.name`, `view.databaseExplorer.name`), settings use
  `config.<path>.description`.
- The view carries `"when": "driftViewer.isDriftProject"` like every sibling
  view in the container — without it the console renders in non-Drift
  workspaces while its neighbors stay hidden.
- Adding a key makes `extension/src/l10n/nls-coverage-data.ts` STALE and fails
  `verify:nls-coverage`; regenerate with `npm run generate:nls-coverage`
  (generated purely from the nls bundles, deterministic).
- Register the provider in `extension-main.ts` phase 5 under `runPhase`, and
  push the disposable into `context.subscriptions`.

### E — Changelog

`CHANGELOG.md` gets an `### Added` bullet under the next version, bold
one-liner first, impact language, pointing at `plans/PLAN_SQL_CONSOLE_SIDEBAR.md`.
No date in the header.

## Verification

- `cd extension && npm run compile` (runs `tsc` + `verify-nls` +
  `verify:nls-coverage` — the NLS gate is the one most likely to fail).
- Scoped mocha run of only the new test files, not the full suite.
- Manual: with a connected server, run (1) a multi-row SELECT → CSV opens
  beside; (2) `SELECT COUNT(*) FROM x` → value inline, no file; (3) an
  UPDATE with the checkbox on → modal prompt appears; (4) same with the
  checkbox off → no prompt; (5) `DROP TABLE x` → error icon, Execute
  disabled; (6) a server with `writeEnabled: false` → explanatory message,
  not silence.

## Out of scope for this plan

- Any change to the server-side validators (`sql_validator.dart`) — the
  existing read-only/mutation classification is authoritative and unchanged.
- Multi-statement execution from the sidebar box (mirrors the existing
  single-statement constraint on `/api/edits/apply` and `/api/sql`).
- Autocomplete/schema-aware suggestions in the sidebar box (the Notebook
  panel already has this; whether the sidebar gets it depends on open
  question 3).
