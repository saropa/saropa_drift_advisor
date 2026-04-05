# BUG: False positive diagnostics fired in non-Drift projects

**Date:** 2026-04-04
**Severity:** High
**Component:** Diagnostics / Dart file parser
**Affects:** Any VS Code workspace containing `.dart` files that are not part of a Drift project

---

## Summary

The Drift Advisor extension fires `missing-table-in-db` and `extra-table-in-db` diagnostics in workspaces that do not use Drift at all. The regex-based Dart parser matches `class Foo extends Table` patterns inside DartDoc comments and code examples, treating them as real Drift table definitions.

## Observed behavior

In the `saropa_lints` project (a Dart custom lint rules package with zero Drift dependency), the following diagnostics appear on `lib/src/rules/packages/drift_rules.dart`:

| Code | Severity | Message |
|------|----------|---------|
| `missing-table-in-db` | Error | Table "todo_items" defined in Dart but missing from database |
| `missing-table-in-db` | Error | Table "todo_items" defined in Dart but missing from database |
| `extra-table-in-db` | Information | Table "activities" exists in database but not in Dart |
| `extra-table-in-db` | Information | Table "address_lat_longs" exists in database but not in Dart |

The file contains lint rule implementations whose DartDoc examples include illustrative `class TodoItems extends Table { ... }` snippets inside `/// ``` dart` fenced code blocks. These are documentation examples, not actual table definitions.

## Expected behavior

No diagnostics should appear because:

1. The project does not depend on `drift` or `saropa_drift_advisor` in `pubspec.yaml`
2. The matched `Table` classes exist inside DartDoc comments (`///`), not as real class declarations
3. There is no Drift database in this project

## Root causes

There are three independent issues contributing to this bug.

### Root cause 1: No project-level guard before scanning

**File:** `extension/src/diagnostics/dart-file-parser.ts` (lines 14-36)

`parseDartFilesInWorkspace()` scans every `*.dart` file in the workspace (excluding only `build/`) with no check for whether the project actually uses Drift. The extension activates on `onStartupFinished` and `workspaceContains:**/pubspec.yaml`, which means it activates in every Dart/Flutter project regardless of dependencies.

The `PackageStatusMonitor` in `extension/src/workspace-setup/package-status-monitor.ts` already knows how to check whether `saropa_drift_advisor` is in `pubspec.yaml` (via `hasPackage()`), but this check is not used as a gate for the diagnostic pipeline. The diagnostics run unconditionally.

**Suggested fix:** Before parsing Dart files, check whether the workspace has `drift` (or `saropa_drift_advisor`) as a dependency. If neither is present, skip the entire diagnostic scan. This could be as simple as:

```typescript
// In dart-file-parser.ts or diagnostic-manager.ts
const pubspec = await readPubspec();
if (!pubspec || (!hasDriftDependency(pubspec) && !hasPackage(pubspec))) {
  return []; // Not a Drift project — skip scanning
}
```

### Root cause 2: Regex matches inside DartDoc comments

**File:** `extension/src/schema-diff/dart-parser.ts` (line 18)

The table detection regex:

```typescript
const TABLE_CLASS_PATTERN = /class\s+(\w+)\s+extends\s+Table\s*\{/g;
```

runs against the raw source text and matches `class ... extends Table {` anywhere in the file, including inside `///` doc comments and string literals containing code examples. The `extractBalanced()` function (line 35) does handle skipping `//`, `/* */`, and string delimiters when counting braces, but the initial regex match that finds candidate table classes does not.

In the triggering file (`drift_rules.dart`), lines 2726 and 2733 contain:

```dart
/// class TodoItems extends Table {
///   IntColumn get categoryId => integer()(); // No FK declared!
/// }
```

These are inside `///` doc comment blocks — they are documentation, not executable code. The regex matches them anyway.

**Suggested fix:** Before accepting a regex match, check whether the matched line is inside a doc comment or string literal. For example:

```typescript
// After finding a match, check if it's inside a doc comment
const lineStart = source.lastIndexOf('\n', match.index) + 1;
const prefix = source.substring(lineStart, match.index).trimStart();
if (prefix.startsWith('///') || prefix.startsWith('*') || prefix.startsWith('//')) {
  continue; // Skip — this is inside a comment
}
```

A more robust approach would be to strip all comments and string literals from the source before running the regex, or to use the Dart analyzer's AST instead of regex.

### Root cause 3: `extra-table-in-db` reports against wrong file

**File:** `extension/src/diagnostics/checkers/table-checker.ts` (lines 47-48)

When the database has tables not found in Dart, `checkExtraTablesInDb()` reports the diagnostic on `dartFiles[0]` — the first Dart file that happened to contain a regex-matched "table". In this case, that is `drift_rules.dart` in the saropa_lints project, which has nothing to do with any database. This makes the diagnostic confusing and misleading.

---

## Reproduction steps

1. Open any Dart project that does **not** depend on `drift` in VS Code
2. Ensure the project contains a `.dart` file with `class Foo extends Table {` inside a doc comment or string literal
3. Have a Drift debug server running from a different project (connected to a real database)
4. Observe Error/Information diagnostics appearing on the non-Drift file

Concrete example:
- Open `d:\src\saropa_lints` in VS Code
- Open `lib/src/rules/packages/drift_rules.dart`
- Observe `missing-table-in-db` errors on lines 2726 and 2733
- Observe `extra-table-in-db` info diagnostics on line 1

## Impact

- **Error-severity diagnostics in clean projects:** The `missing-table-in-db` code defaults to `DiagnosticSeverity.Error`, which shows as red squiggles and increments the Problems panel error count. This is alarming in a project that has nothing to do with Drift.
- **Noise in Problems panel:** Developers who work across multiple Dart projects (some with Drift, some without) see spurious errors that cannot be resolved because there is no actual problem.
- **Confusing error messages:** "Table defined in Dart but missing from database" is meaningless in a non-Drift context and wastes developer time investigating.

## Suggested fix priority

1. **Root cause 1 (project-level guard)** — highest priority, eliminates the entire class of false positives for non-Drift projects
2. **Root cause 2 (comment-aware parsing)** — medium priority, also prevents false positives within Drift projects that have table examples in their docs
3. **Root cause 3 (wrong file attribution)** — lower priority, but still a UX issue when `extra-table-in-db` fires

## Workaround

Disable Drift Advisor for non-Drift workspaces:
- Extensions sidebar > Drift Advisor > gear icon > Disable (Workspace)

## Files involved

| File | Role |
|------|------|
| `extension/src/diagnostics/dart-file-parser.ts` | Workspace-wide `.dart` scan with no dependency check |
| `extension/src/schema-diff/dart-parser.ts` | Regex-based table extraction (line 18: `TABLE_CLASS_PATTERN`) |
| `extension/src/diagnostics/checkers/table-checker.ts` | Produces `missing-table-in-db` and `extra-table-in-db` issues |
| `extension/src/diagnostics/providers/schema-provider.ts` | Orchestrates schema diagnostics |
| `extension/src/diagnostics/codes/schema-codes.ts` | Defines diagnostic codes and default severities |
| `extension/src/workspace-setup/package-status-monitor.ts` | Already has `hasPackage()` logic that could gate diagnostics |
| `extension/package.json` | Activation events: `onStartupFinished`, `workspaceContains:**/pubspec.yaml` |
