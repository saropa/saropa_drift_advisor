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
the `require_test_description_convention` rule:

- New file: `lib/src/fixes/testing_best_practices/suggest_test_description_fix.dart`
- Import + `fixGenerators` added to `RequireTestDescriptionConventionRule`
- Uses AST-based matcher detection via `_MatcherCollector` (RecursiveAstVisitor)
  instead of string-matching on `toSource()` — avoids false positives from
  matchers appearing in string literals or comments
- Properly escapes single vs double quotes based on original literal style
- Supports bulk application via `CorrectionApplicability.acrossFiles`
- Matcher-to-verb mapping: `isTrue` → accept, `isFalse` → reject,
  `isEmpty` → return empty result, `throwsA` → throw, fallback → handle

**Hardening applied:**

1. Verb inference replaced from `toSource()` substring matching to proper AST
   walking — `_MatcherCollector` visits only `expect()` second-argument nodes,
   ignoring matchers in string literals, comments, or other positions.
2. Quote escaping fixed — `_buildQuotedString()` detects whether the original
   used single or double quotes and escapes accordingly.
3. `_resolveStringLiteral()` handles `SimpleStringLiteral`,
   `StringInterpolation`, `AdjacentStrings`, and ancestor-walk fallback.
4. Bulk-fix enabled via `CorrectionApplicability.acrossFiles` so all flagged
   descriptions in a file (or project) can be fixed in one IDE action.

**Tests:** All 269 tests pass across all 6 affected drift_advisor test files.
The saropa_lints fix file passes `dart analyze` with zero issues.

**Scope:** Test descriptions only (drift_advisor). One new fix class + rule
wiring (saropa_lints). Zero assertion or logic changes.
