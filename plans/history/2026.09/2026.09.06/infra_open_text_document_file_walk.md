# BUG: Dart source lookups open every `.dart` file as a real TextDocument instead of reading bytes

**Status: Fixed**

Created: 2026-09-05
Component: Extension
File: `extension/src/definition/drift-source-locator.ts` (lines 32-48 and 80-90), `extension/src/decorations/file-decoration-provider.ts` (lines 63-67)
Severity: Medium

**Severity justification.** Neither call path is a repeating timer over the whole
file set, so this is not the crash loop recorded on the saropa_lints side; it is a
slow command plus an avoidable burst of `onDidOpenTextDocument` events. Verified
call sites:

- `findDriftTableClassLocation` / `findDriftColumnGetterLocation` — user-triggered
  only: `extension/src/definition/drift-definition-provider.ts:66` and `:71`
  (`provideDefinition`, i.e. F12 / ctrl-click / peek inside a SQL string) and
  `extension/src/tree/tree-commands.ts:91` and `:123` (the
  `driftViewer.goToDriftTableDefinition` / `driftViewer.goToDriftColumnDefinition`
  tree commands). No timer, no watcher, no activation call. Both run the **full**
  walk on **every** invocation — there is no cache of any kind here — so a user who
  presses F12 ten times pays ten full workspace walks.
- `buildTableFileMap` — **not** user-triggered. `extension-providers.ts:171` sits
  inside `ensureTableFileMap()`, reached from `refreshBadges()`, which is called
  from the activation path (`extension-activation-event-wiring.ts:223`), from the
  master enable switch (`:70`), from post-connect wiring (`:123`), from the
  generation watcher's `onDidChange` (`:188`) — and that watcher is a `setTimeout`
  poll chain (`extension/src/generation-watcher.ts:21,83`) — and from the
  monitoring kill switch (`monitoring/monitoring-kill-switch.ts:79,183`). It is
  therefore on an activation path and reachable from a polled event.

That last point is what keeps this above Low: the badge walk runs without the user
asking, while the host is at its busiest (activation). It is what keeps this below
High/Critical too, because `tableFileMap` is memoized in the closure
(`extension-providers.ts:131,168`) and is never invalidated, so the walk happens at
most once per activation, and it is additionally gated by `getLightweight()` and by
the monitoring kill switch. A once-per-session burst is a real cost imposed on other
extensions; it is not a self-sustaining loop.

---

## Summary

Three functions locate Dart source by brute-force text search over the workspace.
Each calls `vscode.workspace.findFiles(...)`, then loops the results calling
`await vscode.workspace.openTextDocument(uri)` and `doc.getText()` purely to run a
regular expression over the contents.

`openTextDocument` is the wrong tool for a bulk read. It does far more than read
bytes: it creates and registers a live `vscode.TextDocument` in the extension
host's document manager, keeps it resident, and fires the public
`onDidOpenTextDocument` event that every other installed extension can subscribe
to. None of that is wanted here — the result of the read is a regex match index and
nothing else. `vscode.workspace.fs.readFile()` returns the bytes with none of the
side effects.

The exclusion globs compound it. `drift-source-locator.ts` at least excludes
`build/`, `*.g.dart` and `*.freezed.dart`. `file-decoration-provider.ts:63` passes
`'**/.*'` as its exclude, which only skips dot-prefixed path segments — it does not
exclude `build/`, does not exclude generated `*.g.dart` / `*.freezed.dart`, and does
not exclude package sources dragged into the workspace by `dependency_overrides`.
Generated Drift output can never match its own `class X extends Table` regex
(`drift_dev` emits `class $XTable extends X with TableInfo<...>`), so the largest
files in a Drift project are opened and scanned for a guaranteed-empty result.

---

## Attribution Evidence

```bash
# Positive - the walks ARE here
grep -rn "openTextDocument" extension/src/definition/drift-source-locator.ts \
                            extension/src/decorations/file-decoration-provider.ts
# extension/src/definition/drift-source-locator.ts:38:    const doc = await vscode.workspace.openTextDocument(fileUri);
# extension/src/definition/drift-source-locator.ts:86:    const doc = await vscode.workspace.openTextDocument(fileUri);
# extension/src/decorations/file-decoration-provider.ts:66:    const doc = await vscode.workspace.openTextDocument(uri);
# (drift-source-locator.ts:133 is openLocationOrNotify, which opens ONE file the
#  user is about to see - that call is correct and must not be changed.)

grep -rn "findFiles" extension/src/definition/ extension/src/decorations/
# extension/src/definition/drift-source-locator.ts:32:  const dartFiles = await vscode.workspace.findFiles(
# extension/src/definition/drift-source-locator.ts:80:  const dartFiles = await vscode.workspace.findFiles(
# extension/src/decorations/file-decoration-provider.ts:63:  const uris = await vscode.workspace.findFiles('**/*.dart', '**/.*');

# Call sites - which are user-triggered and which are not
grep -rn "findDriftTableClassLocation\|findDriftColumnGetterLocation\|buildTableFileMap" \
     extension/src --include=*.ts | grep -v /test/ | grep -v drift-source-locator.ts:
# extension/src/definition/drift-definition-provider.ts:66  (provideDefinition  - user)
# extension/src/definition/drift-definition-provider.ts:71  (provideDefinition  - user)
# extension/src/tree/tree-commands.ts:91                    (tree command       - user)
# extension/src/tree/tree-commands.ts:123                   (tree command       - user)
# extension/src/extension-providers.ts:171                  (ensureTableFileMap - NOT user)

grep -rn "refreshBadges" extension/src --include=*.ts | grep -v /test/
# extension/src/extension-activation-event-wiring.ts:70,123,188,223
# extension/src/monitoring/monitoring-kill-switch.ts:79,183

grep -n "setTimeout" extension/src/generation-watcher.ts
# 21:  private _pollTimeout: ReturnType<typeof setTimeout> | undefined;
# 83:      this._pollTimeout = setTimeout(() => this._poll(), delay);
```

**Emit site(s) - list ALL:** not a diagnostic. Hot paths are
`DriftDefinitionProvider.provideDefinition` -> `findDrift*Location`, the two
`driftViewer.goToDrift*Definition` commands, and
`refreshBadges` -> `ensureTableFileMap` -> `buildTableFileMap`.

---

## Environment

- OS: Windows 11 Pro 10.0.22631
- VS Code version: any
- Extension version: 4.3.1
- Database type and version: SQLite (Drift)
- Connection method: local debug server
- Relevant non-default settings: `driftViewer.fileBadges.enabled` (default true);
  reproduces most visibly with the saropa_lints extension also installed and its
  scan-on-save feature enabled.

---

## Steps to Reproduce

1. Open a Flutter app with a realistic file count — 2,500 `.dart` files, several
   hundred of them `*.g.dart` / `*.freezed.dart`, plus a large `database.g.dart`.
2. Install saropa_lints alongside Drift Advisor and leave its scan-on-save
   behavior at its default.
3. Enable Drift Advisor and let it activate (badge refresh runs).
4. Put the cursor on a table name inside a raw-SQL Dart string and press F12 for a
   table that does **not** exist in the workspace, so the loop runs to exhaustion.
5. Watch the saropa_lints output channel and the Dart analysis server.

---

## Expected Behavior

Searching source text for a regex should read file bytes and cost nothing beyond
that I/O. No documents should be created, no workspace-wide events should fire, and
files that provably cannot match (build output, generated code, vendored package
sources) should never be read at all.

---

## Actual Behavior

Every file in the (barely filtered) result set becomes a live `TextDocument` and
fires `onDidOpenTextDocument` into every listening extension. The
`findDriftColumnGetterLocation` loop is the worst case: it opens every file until
the table class matches, and a miss opens all of them.

---

## Minimal Reproducible Example

`extension/src/decorations/file-decoration-provider.ts:59-79` — the weakest glob and
the same wrong read primitive:

```ts
const uris = await vscode.workspace.findFiles('**/*.dart', '**/.*');
//  ^ exclude is '**/.*' only. build/ is IN. *.g.dart and *.freezed.dart are IN.
//    dependency_overrides package sources inside the workspace are IN.

for (const uri of uris) {
  const doc = await vscode.workspace.openTextDocument(uri);  // creates a document,
  const text = doc.getText();                                // fires onDidOpen...
  TABLE_CLASS_RE.lastIndex = 0;                              // ...all to run a regex
  ...
}
```

`extension/src/definition/drift-source-locator.ts:32-48` is the same shape with a
better exclude and no cache at all:

```ts
const dartFiles = await vscode.workspace.findFiles(DART_SOURCE_GLOB, DART_EXCLUDE_GLOB);
for (const fileUri of dartFiles) {
  const doc = await vscode.workspace.openTextDocument(fileUri);
  const text = doc.getText();
  const match = pattern.exec(text);
  ...
}
```

`findDriftColumnGetterLocation` (lines 80-90) repeats the identical loop.

---

## Root Cause

`openTextDocument` was used as "read a file" when its actual contract is "make this
file a first-class open document in the editor host". The read is a means to an end
(a regex match index), but the API chosen publishes that means as a workspace-wide
event, so the cost is paid by every other extension in the window rather than by
this one.

**Fix sketch**

1. Replace the bulk reads with byte reads — no document, no event:

   ```ts
   // Bulk source scanning must not create TextDocuments: openTextDocument
   // registers a live document with the host AND fires onDidOpenTextDocument,
   // which other extensions act on (see the cross-reference under Impact).
   // readFile returns the same bytes with none of those side effects.
   const bytes = await vscode.workspace.fs.readFile(fileUri);
   const text = new TextDecoder('utf-8').decode(bytes);
   ```

   Position mapping must move with it: `doc.positionAt(match.index)` has no
   equivalent on a raw string, so compute line/character by counting newlines
   before `match.index`. Keep `openTextDocument` in `openLocationOrNotify`
   (`drift-source-locator.ts:133`) — there it opens exactly one file the user is
   about to look at, which is precisely what the API is for. Unsaved edits:
   `readFile` sees disk, not the dirty buffer, so consult
   `vscode.workspace.textDocuments` first for a URI already open and use its text
   when present.
2. Tighten the `file-decoration-provider.ts` glob pair to match (or beat) the
   locator's:

   ```ts
   await vscode.workspace.findFiles(
     '**/*.dart',
     '{**/build/**,**/.dart_tool/**,**/*.g.dart,**/*.freezed.dart,**/*.mocks.dart,**/.symlinks/**}',
   );
   ```

   Excluding generated output is safe for this consumer: the regex is
   `class X extends Table`, which generated Drift code never emits.
3. Cache the table-file map with real invalidation rather than the current
   never-invalidated closure variable. A
   `vscode.workspace.createFileSystemWatcher('**/*.dart')` that clears the map on
   create/change/delete both fixes the current staleness (a table class added or
   moved mid-session is never picked up) and keeps the walk from being repeated.
4. Cache the locator lookups too, keyed by table name and invalidated by the same
   watcher, so repeated F12 presses do not each re-walk the workspace.
5. Bound concurrency — batches of roughly 20 `readFile` calls — instead of the
   current fully serial `await` per file.
6. Tests: `extension/src/test/drift-source-locator.test.ts` already asserts the
   exclude glob; add the equivalent assertion for `buildTableFileMap`, and assert
   that neither path calls `openTextDocument`.

---

## Impact

- Who is affected: every user with a non-trivial workspace, and — importantly —
  every **other** extension installed in the same window.
- What actually goes wrong: each `openTextDocument` creates a real VS Code document
  and fires `onDidOpenTextDocument`. That event is public API and other extensions
  react to it. In the incident of 2026-09-05, saropa_lints' scan-on-save controller
  treated an `onDidOpenTextDocument` for a Dart file as "the user opened this file"
  and queued it, which launched full-project resolved lint scans; the machine ended
  up with two `dart.exe` processes holding 22 GB and 13 GB of commit and a dead
  VS Code extension host. See the sibling report
  `d:\src\saropa_lints\bugs\infra_drift_poll_opens_every_dart_file_triggers_full_project_scan.md`
  for the Windows event-log evidence and the scan logs. The saropa_lints half of
  that incident (a 30-second poll doing the same walk, plus a scan-on-save listener
  that cannot tell a programmatic open from a human one) is being fixed separately
  and is the reason that report is Critical while this one is Medium. This report
  covers only the standalone Drift Advisor's identical read pattern, which is a
  contributor at activation and on each go-to-definition, not the loop itself.
- Secondary cost: the opened documents also reach the Dart analysis server as
  `didOpen`, which promotes them to priority files and fully resolves them.
- Related: `042_infra_diagnostic_refresh_reopens_every_dart_file_in_workspace.md`
  records the same anti-pattern in `extension/src/diagnostics/dart-file-parser.ts`;
  a single shared "read Dart sources" helper would fix all four call sites at once.
- Data risk: none.
- Frequency: `buildTableFileMap` once per activation (memoized, never invalidated);
  `findDrift*Location` once per F12 or tree-node click, uncached, full walk each
  time.

---

## Finish Report (2026-09-06)

### Defect

Three bulk-scan functions in the VS Code extension used
`vscode.workspace.openTextDocument(uri)` to read `.dart` file contents for regex
matching. The API creates a live `TextDocument` in the extension host's document
manager, fires `onDidOpenTextDocument` into every listening extension, and promotes
the file with the Dart analysis server. None of those side effects were wanted —
only the file text mattered.

A secondary issue: `buildTableFileMap` used `'**/.*'` as its only exclude glob,
which skipped dot-prefixed path segments but left `build/`, `*.g.dart`,
`*.freezed.dart`, and vendored package sources in scope.

### Fix

A new shared module `extension/src/dart-source-reader.ts` provides:

- `readSourceText(uri)` — reads file bytes via `vscode.workspace.fs.readFile()`
  (no document created, no events fired). Checks `vscode.workspace.textDocuments`
  first so unsaved editor changes are honoured.
- `positionFromOffset(text, offset)` — computes `vscode.Position` from raw text by
  counting newlines, replacing `TextDocument.positionAt()`.
- `DART_SOURCE_EXCLUDE_GLOB` — single-source-of-truth exclude pattern:
  `'{**/.*,**/build/**,**/*.g.dart,**/*.freezed.dart,**/*.mocks.dart}'`. The
  `**/.*` pattern preserves the old decoration-provider's blanket dot-directory
  exclusion (.fvm, .git, .idea, .dart_tool, .symlinks) and extends it to the
  locator functions.

All three call sites (`findDriftTableClassLocation`,
`findDriftColumnGetterLocation`, `buildTableFileMap`) now use these shared helpers.
`openLocationOrNotify` (drift-source-locator.ts:123) is unchanged — it opens one
file the user navigates to, which is the correct use of `openTextDocument`.

### Code review findings

- **Dot-directory exclusion loss (CONFIRMED, fixed):** The initial shared glob
  listed specific dot-dirs instead of the old blanket `**/.*`. Fixed by adding
  `**/.*` back.
- **`encode()` duplication (CONFIRMED, fixed):** Test helper extracted to
  `source-reader-test-helpers.ts`.
- **URI toString() allocation (PLAUSIBLE, fixed):** `readSourceText` now hoists
  `uri.toString()` outside the `.find()` callback.
- **UTF-8 hardcoding (PLAUSIBLE, not fixed):** Dart spec mandates UTF-8 for source
  files.

### Hardening (reflection gate)

- `readSourceText` URI comparison hoisted outside `.find()` loop.
- `positionFromOffset` verified correct for CRLF — `\r` before `\n` does not
  affect line counting because the character offset is measured from `\n`. Added
  a CRLF-specific test case.
- Added integration test that exercises the dirty-buffer fallback path through
  `findDriftTableClassLocation`.

### Unrequested feature: locator cache

Added `DriftSourceLocatorCache` — a `FileSystemWatcher`-backed cache for
`findDriftTableClassLocation` and `findDriftColumnGetterLocation`. The
`DriftDefinitionProvider` and tree commands now use the cache so repeated F12
presses and tree-node clicks return instantly instead of re-walking the
workspace. The cache invalidates when any `.dart` file is created, changed, or
deleted. A manual `clearCache()` method is available for schema-refresh
triggers.

### Test results

3195 tests passing, 0 failures. Net +13 new tests.
