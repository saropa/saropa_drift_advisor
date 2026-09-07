# Batch Fix: 8 Diagnostic False Positives and False Negatives

Eight diagnostic bugs in the VS Code extension produced false positives or
false negatives across FTS shadow tables, DateTime column types, data-skew
thresholds, anomaly checking, raw SQL tokenization, file-inclusion gating,
named column overrides, and SQL literal masking.

## Finish Report (2026-09-07)

### Changes

| Bug | Fix summary |
|-----|-------------|
| FTS5 shadow tables flagged as extra | `isFtsShadowTable` requires 3+ shadow siblings before classifying; `isEngineOwnedTable` umbrella check filters in `schema-provider.ts` |
| DateTime column type drift false positive | `dartToSqlType()` reads `store_date_time_values_as_text` from `build.yaml`; `IDiagnosticContext.dateTimeAsText` propagated through diagnostic pipeline |
| Data skew false positive on small table counts | Adaptive threshold `Math.max(50, expectedShare * SKEW_MULTIPLE)` with `MIN_ROWS_FOR_SKEW=1000` floor; engine-owned tables excluded from denominator |
| Anomaly false negative on duplicate rows | Structured `anomaly.table`/`anomaly.column` fields preferred over regex extraction; regex fallback retained |
| Raw SQL false positive on Dart interpolation | `${...}` braced interpolations blanked with brace-depth tracking; `$`/`:`/`@` bind params tokenized as `param` kind |
| Raw SQL false negative on tableless files | `RAW_SQL_CALL` regex widens file-inclusion gate to `customSelect`/`customStatement` |
| Getter-table-mismatch false positive on .named() | `NAMED_RE` captures non-word characters; `hasNamedOverride` flag set on `IDartColumn`; naming provider skips check when true |
| SQL validator false positive on literal keywords | `blankLiteralsAndComments` masks literals before keyword/semicolon checks |

### Test coverage

- 3322 tests passing, 0 failing
- New tests across 11 test files covering FTS shadow detection (15 tests),
  DateTime type resolution, adaptive data-skew threshold, structured anomaly
  fields, param tokenization, interpolation blanking, named-override skip,
  SQL literal masking (7 tests), and integration scenarios

### Cross-review findings applied

- CRITICAL: FTS5 single-suffix false positive on `user_data` — fixed with `MIN_FTS_SHADOW_SIBLINGS = 3`
- MODERATE: Data-skew test passing for wrong reason (below row floor) — row counts bumped to 600/500
- MODERATE: Excluded tables inflating totalRows denominator — filtered before computing expectedShare
- MODERATE: YAML comment false positive in `parseDateTimeAsText` — regex prefix `^[^#\n]*` with `/m` flag

### Files modified

33 files: 8 bug docs, 14 source files, 11 test files

### Excluded

`BUG_WEB_VIEWER_L10N_PLACEHOLDER_TOKENS_LEFT_UNRESTORED_IN_SEVEN_LOCALES.md`
requires human review of 330 translated strings — left open.
