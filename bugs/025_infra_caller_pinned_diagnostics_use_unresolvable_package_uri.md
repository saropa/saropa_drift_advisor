# BUG: Caller-pinned diagnostics are attached to a `package:` URI VS Code cannot resolve

**Status: Open**

Created: 2026-09-02
Component: Extension
File: `extension/src/diagnostics/utils/caller-location-utils.ts` (line ~36)
Severity: UX / diagnostics silently unreachable

---

## Summary

`resolveCallerLocation` does `vscode.Uri.parse(query.callerFile)` and uses the result as the diagnostic's file URI. The Dart server's `_parseCallerFrame` returns the raw stack-frame path, which for application code in a Flutter/Dart app is a `package:` URI (`package:my_app/db/contacts_dao.dart`). VS Code has no filesystem provider for the `package` scheme, so `slow-query-pattern` and `n-plus-one` diagnostics land on a phantom entry that cannot be opened, and never appear against the user's actual source file. Nothing in either tree maps `package:` to a workspace path.

---

## Attribution Evidence

```bash
# Positive - the affected diagnostics ARE defined here
grep -rn "'slow-query-pattern'" extension/src/
# extension/src/diagnostics/checkers/slow-query-checker.ts:97:      code: 'slow-query-pattern',
# extension/src/diagnostics/codes/performance-codes.ts:23,24
# extension/src/diagnostics/providers/performance-provider.ts:54

grep -rn "'n-plus-one'" extension/src/
# extension/src/diagnostics/checkers/n-plus-one-checker.ts:110:        code: 'n-plus-one',
# extension/src/diagnostics/codes/performance-codes.ts:34,35
# extension/src/diagnostics/providers/performance-provider.ts:105

grep -rn "'slow-query-pattern'\|'n-plus-one'" lib/src/
# Expected: 0 matches (TypeScript-only diagnostics)

# The producing side, for completeness
grep -rn "callerFile" lib/src/
# lib/src/server/server_context.dart:586,622,685,696
# lib/src/server/server_types.dart:246,261,282,289,300

# No package:-to-file resolution exists anywhere in the extension
grep -rn "package:" --include=*.ts extension/src | grep -iE "Uri\.|resolve|toFile|packageUri"
# extension/src/diagnostics/utils/caller-location-utils.ts:34:  // The server sends either a package: URI or a file: URI.
# (the comment is the only hit - there is no resolution code)

# Negative - not a sibling-repo rule
grep -rn "'slow-query-pattern'" ../saropa_lints/lib/src/rules/
grep -rn "'n-plus-one'" ../saropa_lints/lib/src/rules/
# Expected: 0 matches   (actual: 0 matches; ../saropa_lints/lib/src/rules/ exists, 21 entries)
```

**Emit site(s) - list ALL:**
- `extension/src/diagnostics/checkers/slow-query-checker.ts:77` (uses `callerLoc.uri` set at line 48)
- `extension/src/diagnostics/checkers/n-plus-one-checker.ts:108` (uses `callerLoc.uri` set at line 70)

**Diagnostic `source` / `owner` as seen in Problems panel:** `drift-advisor`

---

## Environment

- OS: Windows 11 Pro 10.0.22631
- VS Code version: any
- Extension version: 4.2.5
- Dart SDK version: any
- Flutter SDK version: any (the issue is specific to Flutter/Dart apps, whose own code is `package:<app_name>/...`)
- Database type and version: SQLite (Drift)
- Connection method: local debug server
- Relevant non-default settings: `driftViewer.diagnostics.categories.runtime` enabled (default)

---

## Steps to Reproduce

1. In a Flutter app named `my_app`, issue a query in a loop from `lib/db/contacts_dao.dart` so N+1 detection trips (>= 10 similar reads in the recent window):

   ```dart
   Future<void> loadAll(List<int> ids) async {
     for (final id in ids) {
       await customSelect('SELECT * FROM contacts WHERE id = ?',
           variables: [Variable(id)]).get();
     }
   }
   ```

2. Run with 20 ids so `data.count >= 20`.
3. Connect the extension and wait for a diagnostic refresh.
4. Open the Problems panel and try to click the reported `n-plus-one` entry.

---

## Expected Behavior

A diagnostic on `lib/db/contacts_dao.dart` at the loop's query line, clickable, opening the file at that line - the whole stated purpose of caller pinning ("point at the Dart call site that issued the query, rather than the table definition file - which the developer cannot change to fix a runtime access pattern", `caller-location-utils.ts:5-10`).

---

## Actual Behavior

The diagnostic is set on `package:my_app/db/contacts_dao.dart`. VS Code has no provider for that scheme, so the Problems panel shows an unresolved entry rather than the workspace file, and clicking it fails. The diagnostic is effectively invisible - and the table-definition fallback that would have worked is skipped, because `callerLoc` was non-null.

---

## Minimal Reproducible Example

The server frame produced by `_parseCallerFrame` (`lib/src/server/server_context.dart:643-676`) for the loop above:

```
#2      ContactsDao.loadAll (package:my_app/db/contacts_dao.dart:14:24)
```

`_parseCallerFrame`'s regex `#\d+\s+\S+\s+\((.+?):(\d+):\d+\)` captures group 1 verbatim:

```
callerFile = "package:my_app/db/contacts_dao.dart"
callerLine = 14
```

The extension then does:

```ts
// caller-location-utils.ts:36
const uri = vscode.Uri.parse("package:my_app/db/contacts_dao.dart");
// -> { scheme: "package", authority: "", path: "my_app/db/contacts_dao.dart" }
```

and `DiagnosticManager._applyDiagnostics` calls `this._collection.set(vscode.Uri.parse(uri), diags)` with it (`diagnostic-manager.ts:215-217`).

The frame filters in `_parseCallerFrame` confirm the intent is to surface *application* frames - it explicitly skips `saropa_drift_advisor/src/server/`, `dart:` and `package:flutter/`, i.e. everything except `package:<the user's app>/...` and `file:///` frames. So the `package:` form is the normal case, not an edge case.

The same defect degrades the caller-pinned suppression path in `diagnostic-apply.ts:56`: `issue.data.tableFileUri !== issue.fileUri.toString()` compares a `file:` string against a `package:` string, so the two can never be recognised as the same file.

### Existing tests lock in the broken behaviour

`extension/src/test/performance-provider.test.ts:74-103` (`should pin slow-query-pattern to caller
location when available`) feeds exactly the URI form this report is about:

```ts
callerFile: 'package:myapp/src/order_io.dart',
callerLine: 42,
```

and then asserts only a substring:

```ts
assert.ok(
  issue.fileUri.toString().includes('order_io.dart'),
  `Expected caller file URI but got ${issue.fileUri.toString()}`,
);
```

`package:myapp/src/order_io.dart` contains `order_io.dart`, so the assertion passes while the
produced URI is unopenable. `extension/src/test/performance-provider-nplus1.test.ts:63` (`should pin
n-plus-one to caller location when available`) has the same shape. Any fix must tighten these two
assertions to check the resolved scheme and full path, or they will keep certifying the defect.


---

## Root Cause

The comment at `caller-location-utils.ts:34` asserts "The server sends either a package: URI or a file: URI. `vscode.Uri.parse` handles both correctly." `Uri.parse` does parse both without throwing - but parsing is not resolving. A `package:` URI is a Dart-toolchain concept; VS Code cannot read it, and `DiagnosticCollection.set` accepts and stores diagnostics under any scheme without validation.

**Fix sketch**

1. Add a `package:` -> workspace-path resolver, used by `resolveCallerLocation` before constructing the URI:
   - Read the root `pubspec.yaml`'s `name:` once (the same file `dart-file-parser.ts:32` already reads for `isDriftProject`). For `package:<name>/<rest>`, map to `<workspaceFolder>/lib/<rest>` - the Dart package layout guarantees `package:<name>/x` is `lib/x`.
   - For other packages, fall back to `.dart_tool/package_config.json`, which maps every package name to a `rootUri`; that file exists in every `pub get`-ed project.
2. Return `null` (never a `package:` URI) when resolution fails, so the checkers take their existing table-definition fallback instead of pinning to an unopenable URI. `slow-query-checker.ts:50-62` and `n-plus-one-checker.ts:85-95` already implement that path.
3. Verify the resolved file exists (`vscode.workspace.fs.stat`) before pinning; a stale caller path from an older build should degrade to the fallback rather than create a phantom entry.
4. Once (1) lands, compare resolved URIs rather than raw strings in `diagnostic-apply.ts:56`.
5. Tests: `extension/src/test/` has no coverage for `resolveCallerLocation`. Add cases for `package:<own app>/`, `package:<dependency>/`, `file:///`, and an unresolvable package name.

---

## Impact

- Who is affected: every Flutter/Dart app user - application frames are `package:` URIs by construction.
- What is blocked: the entire caller-pinning feature for `slow-query-pattern` and `n-plus-one`. Because pinning "succeeds" (a URI is produced), the working table-definition fallback is bypassed, so these diagnostics are *less* visible than before caller pinning existed. The Unreleased CHANGELOG entry calls caller pinning "the common case", which makes this the common path.
- Data risk: none.
- Frequency: every caller-pinned diagnostic in a Flutter/Dart app.
