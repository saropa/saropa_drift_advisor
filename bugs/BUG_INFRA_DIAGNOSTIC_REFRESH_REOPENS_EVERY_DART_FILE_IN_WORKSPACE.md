# BUG: Every diagnostic refresh re-opens and re-parses every `.dart` file in the workspace, including generated code

**Status: Open**

Created: 2026-09-02
Component: Extension
File: `extension/src/diagnostics/dart-file-parser.ts` (lines 56-79), `extension/src/diagnostics/diagnostic-manager.ts` (line 223)
Severity: Performance

---

## Summary

`parseDartFilesInWorkspace` runs `vscode.workspace.findFiles('**/*.dart', '**/build/**')`, then serially `openTextDocument`s and `getText()`s every result and runs five regex passes over each. It is called unconditionally at the start of every `DiagnosticManager.refresh()` - on every Dart file save, every schema-intelligence change, and every relevant configuration change - with no per-file caching, no mtime check, and no exclusion of generated or vendored Dart. In a mid-size Flutter app this is thousands of files, including the multi-megabyte `*.g.dart` Drift output, re-read from scratch every five seconds under sustained editing.

---

## Attribution Evidence

```bash
# Positive - the scan IS here
grep -rn "findFiles" extension/src/diagnostics/
# extension/src/diagnostics/dart-file-parser.ts:56:  const dartUris = await vscode.workspace.findFiles(
# extension/src/diagnostics/dart-file-parser.ts:57:    '**/*.dart',
# extension/src/diagnostics/dart-file-parser.ts:58:    '**/build/**',

grep -rn "parseDartFilesInWorkspace" extension/src/ | grep -v /test/
# extension/src/diagnostics/dart-file-parser.ts:50:export async function parseDartFilesInWorkspace()
# extension/src/diagnostics/diagnostic-manager.ts:13:  (import)
# extension/src/diagnostics/diagnostic-manager.ts:223:    const dartFiles = await parseDartFilesInWorkspace();

grep -rn "parseDartFilesInWorkspace" lib/src/
# Expected: 0 matches (workspace scanning is TypeScript-only)

# Negative - not a sibling-repo rule
grep -rn "parseDartFilesInWorkspace" ../saropa_lints/lib/src/rules/
# Expected: 0 matches   (actual: 0 matches; ../saropa_lints/lib/src/rules/ exists, 21 entries)
```

**Emit site(s) - list ALL:** not a diagnostic; the hot path is `DiagnosticManager._buildContext` -> `parseDartFilesInWorkspace` (`extension/src/diagnostics/diagnostic-manager.ts:220-232`).

---

## Environment

- OS: Windows 11 Pro 10.0.22631
- VS Code version: any
- Extension version: 4.2.5
- Database type and version: SQLite (Drift)
- Connection method: local debug server
- Relevant non-default settings: `driftViewer.diagnostics.refreshOnSave` enabled (default)

---

## Steps to Reproduce

1. Open a Flutter app with a realistic file count - e.g. 2,500 `.dart` files, of which ~400 are `*.g.dart` / `*.freezed.dart` and one is a 25,000-line `database.g.dart`.
2. Connect the extension to a running debug server so `SchemaIntelligence` starts emitting change events.
3. Edit and save any Dart file repeatedly (or simply leave the session running while the app writes to the database).
4. Watch the extension host's CPU while the 5-second refresh interval elapses.

---

## Expected Behavior

A refresh should re-read only what changed. The scan's inputs are file contents, which change rarely and are already tracked by VS Code; a refresh triggered by a *database* change (`schemaIntel.onDidChange`) should not touch the filesystem at all.

---

## Actual Behavior

Every refresh performs a full workspace scan and re-parse. There is no cache anywhere in the path:

- `_buildContext` calls `parseDartFilesInWorkspace()` unconditionally (`diagnostic-manager.ts:223`);
- `parseDartFilesInWorkspace` has no memoisation, no `mtime` comparison, and no reuse of the previous result;
- `refresh()` is scheduled from three listeners (`onDidSaveTextDocument`, `schemaIntel.onDidChange`, `onDidChangeConfiguration`) with a 5-second floor, so the worst case is one full scan every five seconds indefinitely.

---

## Minimal Reproducible Example

The full path, with the costs each step pays per refresh (`dart-file-parser.ts:50-81`):

```ts
const dartUris = await vscode.workspace.findFiles('**/*.dart', '**/build/**');
//  ^ 2,500 URIs. The single exclude is '**/build/**' - NOT '**/.dart_tool/**',
//    NOT '**/*.g.dart', NOT '**/*.freezed.dart', NOT ios/ android/ windows/ linux/.

for (const uri of dartUris) {
  const doc  = await vscode.workspace.openTextDocument(uri);   // serial, one await per file
  const text = doc.getText();                                  // full copy of every file
  const tables = parseDartTables(text, uri.toString());        // 5 global regex passes
  if (tables.length > 0) {
    files.push({ uri, text, tables, suppressions: parseInlineSuppressions(text) });
    //           ^^^^ every retained file's full text is held for the whole refresh
  }
}
```

Three separate costs compound:

1. **Serial I/O.** The loop `await`s each `openTextDocument` in turn. There is no `Promise.all` and no concurrency limit; 2,500 sequential round-trips through the extension-host filesystem API dominate wall time.
2. **Generated-code parsing.** A Drift project's `database.g.dart` is one of the largest files in the repo, is regenerated by `build_runner` (so it churns), and can never contain a `class X extends Table {` declaration - `drift_dev` emits `class $XTable extends X with TableInfo<...>`. It is read and regex-scanned in full on every refresh for a guaranteed-empty result. The same applies to `*.freezed.dart` and to anything under `.dart_tool/`.
3. **Document-cache growth.** `openTextDocument` registers the document with VS Code's text-document manager and returns a live `TextDocument`. Opening every `.dart` file in the workspace, every refresh, keeps the whole tree resident rather than just the files the user has open.

`parseInlineSuppressions` adds a sixth pass (`source.split(/\r?\n/)` plus a regex per line) over each retained file's text.

---

## Root Cause

The context builder treats "the set of parsed Dart tables" as cheap, refresh-scoped derived state, when it is in fact expensive state whose inputs change on a completely different (and much slower) schedule than the refreshes that consume it. The most common refresh trigger - `schemaIntel.onDidChange`, i.e. the *database* changed - cannot possibly have changed any Dart file, yet pays the full scan.

**Fix sketch**

1. Cache the parsed result and invalidate it from a `FileSystemWatcher` rather than rebuilding per refresh:

   ```ts
   // Dart sources change on save, not on every database poll. Rebuilding the
   // whole workspace parse on a schemaIntel change re-reads thousands of files
   // whose contents provably did not change.
   private _dartFilesCache: IDartFileInfo[] | undefined;
   // invalidate from vscode.workspace.createFileSystemWatcher('**/*.dart')
   // on onDidChange / onDidCreate / onDidDelete
   ```

   Incremental re-parse of the single changed file is the natural follow-on, since `parseDartTables` is already per-file and pure.
2. Widen the exclude glob to skip provably-empty inputs:

   ```ts
   await vscode.workspace.findFiles(
     '**/*.dart',
     '{**/build/**,**/.dart_tool/**,**/*.g.dart,**/*.freezed.dart,**/*.mocks.dart,**/.symlinks/**}',
   );
   ```

   Excluding `*.g.dart` is safe for the table-parsing consumer (generated table classes do not use the `extends Table {` form) but must be checked against the raw-SQL consumer if `023_raw_sql_unknown_column_false_negative_files_without_tables.md` is fixed first - generated code contains no `customSelect` calls the user can act on either, so the exclusion holds for both.
3. Read bytes directly with `vscode.workspace.fs.readFile` instead of `openTextDocument`, falling back to the open document when one exists (so unsaved edits are still honoured). This avoids populating the document cache with the entire workspace.
4. Bound the concurrency rather than going fully serial - e.g. batches of 20 `readFile` calls - so the scan is I/O-parallel without spawning thousands of simultaneous handles.
5. Test: `extension/src/test/dart-file-parser.test.ts` covers `isDriftProject` only. Add a test asserting the exclude glob passed to `findFiles` and one asserting a second refresh with no file changes performs no re-read.

---

## Impact

- Who is affected: every user with a non-trivial workspace; the cost scales linearly with total `.dart` file count, not with the number of table definitions.
- What is blocked: nothing functionally, but the extension host burns CPU on a 5-second cycle for the life of the session, which is felt as editor latency. This is the same class of cost as the startup freeze recorded in `plans/history/2026.06/2026.06.17/BUG_STARTUP_HANG.md` - that one was fixed on the SQL-probe side, and this is the filesystem-side equivalent that was not.
- Data risk: none.
- Frequency: every refresh - at minimum every save, and every schema-intelligence change while connected.
