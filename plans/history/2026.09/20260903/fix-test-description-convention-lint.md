# Fix test description convention lint warnings

Short noun-phrase test descriptions (`'INSERT INTO'`, `'UPDATE'`, `'PRAGMA'`,
etc.) across 6 test files violated the `require_test_description_convention`
lint rule requiring `should [action] when [condition]` format.

## Finish Report (2026-09-03)

**What changed (drift_advisor):** Renamed ~30 test descriptions across 6 test
files to follow the `should [action] when [condition]` convention:

- `sql_validation_test.dart` — 19 descriptions (both `isReadOnlySql` and
  `isSingleDataMutationSql` groups)
- `drift_debug_import_test.dart` — 4 descriptions in `parseCsvLines` group
- `drift_debug_session_test.dart` — 1 description (`maxSessions`)
- `index_batch_handler_test.dart` — 1 description (`case-insensitive`)
- `schema_handler_test.dart` — 1 description (`drops nameless rows`)
- `server_context_test.dart` — 7 descriptions (`parseOffset`, `sqlLiteral`,
  `rowSignature`, `isTextType`, `isNumericType`, `sortAnomaliesBySeverity`)

**What changed (saropa_lints):** Added `SuggestTestDescriptionFix` quick-fix to
the `require_test_description_convention` rule. The fix inspects `expect()`
matchers in the test body (`isTrue` → "accept", `isFalse` → "reject", etc.)
to auto-generate a description prefix. Wired via `fixGenerators` override.

- New file: `lib/src/fixes/testing_best_practices/suggest_test_description_fix.dart`
- Import + `fixGenerators` added to `RequireTestDescriptionConventionRule`

**Tests:** All 269 tests pass across all 6 affected drift_advisor test files.
The saropa_lints fix file passes `dart analyze` with zero issues. No fix-level
unit test added — saropa_lints has no existing fix test harness; the fix is
verified via IDE quick-fix UI.

**Scope:** Test descriptions only (drift_advisor). One new fix class + rule
wiring (saropa_lints). Zero assertion or logic changes.
