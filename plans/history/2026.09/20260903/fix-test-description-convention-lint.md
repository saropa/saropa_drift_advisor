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

**Hardening (round 1):**

1. AST-based matcher detection via `_MatcherCollector` (RecursiveAstVisitor)
   instead of `toSource()` string matching — avoids false positives from
   matchers appearing in string literals or comments.
2. Quote escaping: `_buildQuotedString()` detects single vs double quotes
   from the original literal and escapes only the relevant character.
3. `_resolveStringLiteral()` handles `SimpleStringLiteral`,
   `StringInterpolation`, `AdjacentStrings`, and ancestor-walk fallback.
4. Bulk-fix via `CorrectionApplicability.acrossFiles`.

**Hardening (round 2):**

1. Smart subject extraction: `_ExpectCollector._extractSubject()` inspects the
   first argument of `expect()` to extract a readable subject name — static
   calls (`SqlValidator.isReadOnlySql(...)` → `SqlValidator.isReadOnlySql`),
   instance calls, property access (`obj.field`), and simple identifiers.
   Subject is prefixed to the description when available.
2. Expanded verb map: added coverage for collection matchers (`contains`,
   `hasLength`, `everyElement`), equality matchers (`equals`, `isA`, `matches`),
   error matchers (`throwsFormatError`, `throwsUnsupportedError`), and widget
   test matchers (`findsOneWidget`, `findsNothing`, `findsWidgets`).
3. Refactored `_MatcherCollector` → `_ExpectCollector` to collect both subject
   and matcher per expect() call via `_ExpectEntry` data class.
4. `_extractMatcherName` returns nullable `String?` instead of void-adding to
   a list — cleaner control flow, skips unrecognized matcher forms.

**Tests:** All 269 tests pass across all 6 affected drift_advisor test files.
The saropa_lints fix file passes `dart analyze` with zero issues.

**Scope:** Test descriptions only (drift_advisor). One new fix class + rule
wiring (saropa_lints). Zero assertion or logic changes.
