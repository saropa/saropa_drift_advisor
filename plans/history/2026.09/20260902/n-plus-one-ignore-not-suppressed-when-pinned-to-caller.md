## Status: Fixed

## Title

`drift-advisor:ignore n-plus-one` comment in table definition file is not suppressed when the diagnostic is pinned to a caller location

## Environment

- OS: Windows 11 Pro 10.0.22631 x64
- VS Code version: current
- Extension version: saropa_drift_advisor v4.2.5 (commit 952246c)
- Dart SDK version: current stable
- Database type and version: SQLite via Drift
- Connection method: local (Drift Advisor server at 127.0.0.1:8642)
- Relevant non-default settings: none
- Other potentially conflicting extensions: none

## Steps to Reproduce

1. Open a Flutter/Drift project with `saropa_drift_advisor` active and the Drift Advisor server running.
2. Add `// drift-advisor:ignore n-plus-one` as a comment immediately above the table class declaration in a Drift table file (e.g. `activity_table.dart` line 25).
3. Run the app so the table generates enough queries to trigger the N+1 threshold (>=10 queries to the same table in a recent window).
4. Wait for the diagnostics to refresh.
5. Observe that the `n-plus-one` diagnostic still appears on the table class line.

Minimal table file:

```dart
// drift-advisor:ignore n-plus-one -- queries are intentionally batched
class Activities extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get activityTypeName => text()();
  DateTimeColumn get activityDateTime => dateTime()();
}
```

## Expected Behavior

The `n-plus-one` diagnostic should be suppressed because `// drift-advisor:ignore n-plus-one` is present in the table definition file, either as a field-level directive above the class or as a file-level directive (`drift-advisor:ignore-file n-plus-one`).

## Actual Behavior

The diagnostic fires on line 29 of `activity_table.dart` despite the ignore comment on line 25. The VS Code Problems panel shows:

```
[drift_advisor] Potential N+1 query pattern: "activities" queried 10 times in recent window
  owner: drift-advisor
  code: n-plus-one
  severity: 2 (Warning)
  source: Drift Advisor
```

## Error Output

No errors in Developer Tools or Output channel. The diagnostic is emitted normally; it is just not suppressed.

## Emitter Attribution

- owner: `drift-advisor`
- code: `n-plus-one`
- source: `Drift Advisor`
- Registered at: `extension/src/diagnostics/codes/performance-codes.ts:34`
- Emit site(s):
  - `extension/src/diagnostics/checkers/n-plus-one-checker.ts:94` (constructs the issue)
  - `extension/src/diagnostics/providers/performance-provider.ts:105` (routes the code)
- Suppression check at: `extension/src/diagnostics/diagnostic-apply.ts:42-48`
- Grep command used: `grep -rn "n-plus-one" extension/src/`
- Sibling-repo negative grep: `grep -rn "n-plus-one" ../saropa_lints/lib/` -> 0 matches
- `lib/src/` grep: `grep -rn "n-plus-one" lib/src/` -> 0 matches (TypeScript extension path only)

## Root Cause Analysis

The suppression system works correctly for schema-level diagnostics (`high-null-rate`, `unused-column`, `anomaly`) because those diagnostics always pin to the table definition file where the ignore comments live. The `n-plus-one` checker (`n-plus-one-checker.ts:60-79`) has two code paths for choosing the diagnostic's `fileUri` and `line`:

1. **Caller location available** (line 66-68): pins the diagnostic to the caller site (the `.dart` file that issues the query), NOT the table definition file.
2. **No caller location** (line 70-78): falls back to the table definition file.

The suppression check in `diagnostic-apply.ts:42` looks up suppressions by `issue.fileUri.toString()`. When the diagnostic is pinned to a caller location:

- The `suppressionsByUri` map was built from the Drift table definition files (the `dartFiles` list).
- The caller file is typically NOT in that map (it is an IO class or service file, not a table file).
- The `.get()` returns `undefined`, so the `if (supps && ...)` check short-circuits and the suppression is skipped entirely.

Even if the user adds a `// drift-advisor:ignore n-plus-one` comment in the caller file, it would not be parsed because `parseInlineSuppressions()` only processes files in the `dartFiles` list (table definition files).

The ignore comment in the table definition file is correctly formatted and would suppress the diagnostic if the checker fell back to the table file location — but when a caller location exists, the table file's suppressions are never consulted.

## Proposed Fix

When the n-plus-one checker resolves to a caller location, `diagnostic-apply.ts` should check suppressions in BOTH the pinned file (caller) AND the table definition file. Concretely:

1. Attach `data.tableFileUri` (the table definition URI) to the issue in `n-plus-one-checker.ts` so the suppression check can find it.
2. In `diagnostic-apply.ts`, after the primary `suppressionsByUri.get(issue.fileUri)` check fails, fall back to `suppressionsByUri.get(issue.data?.tableFileUri)` for file-level suppressions.

Alternative: expand `parseInlineSuppressions()` to scan caller files too — but this is heavier and less targeted.

## What I Already Tried

- [x] Added `// drift-advisor:ignore n-plus-one` above the table class (line 25) — not suppressed
- [x] Verified that `// drift-advisor:ignore-file unused-column` at line 4 of the same file works for `unused-column` diagnostics (it does)
- [x] Verified that `// drift-advisor:ignore high-null-rate` on column lines works (it does)
- [x] Read the checker source to confirm the caller-location pin is the cause
- [x] Read `diagnostic-apply.ts` to confirm the URI mismatch

## Regression Info

- Last working version: N/A — this has likely never worked for caller-pinned n-plus-one diagnostics.
- First broken version: present since the caller-location feature was added to the n-plus-one checker.

## Impact

- Who is affected: any project using `drift-advisor:ignore n-plus-one` in table files where the checker resolves a caller location.
- What is blocked: no way to suppress a legitimate n-plus-one diagnostic short of disabling the entire `n-plus-one` rule globally via config.
- Data risk: none.
- Frequency: every time the diagnostic fires with a resolved caller location.

## Finish Report (2026-09-02)

The n-plus-one checker (`n-plus-one-checker.ts`) pins diagnostics to caller locations when available, but the suppression layer (`diagnostic-apply.ts`) only consulted inline-suppression directives for the file the diagnostic was pinned to. Since caller files (repositories, services) are not in the `dartFiles` list, `suppressionsByUri.get()` returned `undefined` and skipped suppression entirely — even when `// drift-advisor:ignore n-plus-one` was correctly placed in the table definition file.

### Changes

**`extension/src/diagnostics/checkers/n-plus-one-checker.ts`** — When caller location is used, the checker now resolves the table definition file via `findDartFileForTable` and attaches `tableFileUri` (stringified URI) and `tableFileLine` (0-based class declaration line) to the issue's `data` record. When no caller location is available (table-pinned fallback), these fields are omitted.

**`extension/src/diagnostics/diagnostic-apply.ts`** — After the primary suppression check (which looks up `issue.fileUri` in `suppressionsByUri`), a new fallback block checks whether `issue.data.tableFileUri` exists, differs from the pinned file, and has matching suppressions via `isInlineSuppressed`. The fallback uses `tableFileLine` for field-level directive matching (not the caller's line, which is meaningless in the table file). File-level `ignore-file` directives work automatically since `isInlineSuppressed` checks them regardless of line number.

### Test coverage

- Extended the "should pin n-plus-one to caller location" test in `performance-provider-nplus1.test.ts` to assert `data.tableFileUri` and `data.tableFileLine` are present and correctly typed.
- Created `diagnostic-apply-suppression.test.ts` with 5 targeted tests: field-level fallback suppression, file-level fallback suppression, pass-through when no directive exists, primary-check verification for table-pinned diagnostics, and wrong-code non-suppression guard.
- Full suite: 3113 tests passing, 0 failures.

### Hardening pass

**`extension/src/diagnostics/diagnostic-types.ts`** — Added `ICallerPinnedData` interface (`tableFileUri: string`, `tableFileLine: number`) and `hasCallerPinnedData()` type guard. Any checker that pins to a caller site now uses this typed structure instead of ad-hoc `Record<string, unknown>` fields, so missing fields are caught at compile time rather than silently passing through.

**`extension/src/diagnostics/checkers/slow-query-checker.ts`** — Same bug existed here: `slow-query-pattern` also pins to caller location via `resolveCallerLocation` but did not attach table file info. Now resolves the table definition file and attaches `ICallerPinnedData` to the issue's `data`, so inline suppressions in the table file are honoured for slow-query diagnostics too.

**`extension/src/diagnostics/diagnostic-apply.ts`** — Replaced runtime `typeof` checks with the `hasCallerPinnedData` type guard for cleaner, compile-time-verified fallback logic.

### What this does NOT fix

- Caller files (e.g. `user_repository.dart`) are still not scanned for `// drift-advisor:ignore` directives. Only table definition files in `dartFiles` are parsed. A user who places an ignore comment in the caller file will not see it honoured. This is by design — table files are the single source of truth for suppressions.
