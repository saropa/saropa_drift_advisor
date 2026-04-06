# Bug: `anomaly` fires false positive on boolean columns with skewed distributions

**Created:** 2026-04-01
**Severity:** Medium — false positives erode trust in the anomaly scanner
**Component:** `lib/src/server/anomaly_detector.dart` — `_detectNumericOutliers()`

---

## Summary

The `potential_outlier` numeric anomaly diagnostic fires on boolean columns stored as `INTEGER 0/1` when the distribution is skewed. Boolean columns with a low percentage of `true` values (e.g., 9% or 0%) trigger the "max > 10× average" heuristic because `max(1) > avg(0.09) × 10`. This heuristic was designed for continuous numeric data (prices, ages, quantities) where a 10× deviation suggests a data entry error — it is meaningless for a binary domain.

## Reproduction

1. Define a Drift table with boolean columns that have an intentionally skewed distribution:

```dart
@DataClassName('PublicFigureDriftModel')
class PublicFigures extends Table {
  // ~9% of public figures are nickname-only (Madonna, Cher, Pelé)
  BoolColumn get isNicknameOnly =>
      boolean().named('is_nickname_only').withDefault(const Constant<bool>(false))();

  // ~0% of public figures force middle-name display (reserved for rare cases like JFK)
  BoolColumn get isAlwaysShowMiddleName =>
      boolean().named('is_always_show_middle_name').withDefault(const Constant<bool>(false))();
}
```

2. Populate the table with realistic data (e.g., 100 public figures, 9 with `is_nickname_only = true`).

3. Run drift-advisor analysis.

4. Observe two false-positive warnings on the table class declaration:

```
[drift_advisor] Potential outlier in public_figures.is_nickname_only: range [0.0, 1.0], avg 0.09
[drift_advisor] Potential outlier in public_figures.is_always_show_middle_name: range [0.0, 1.0], avg 0.00
```

## Expected behavior

Boolean columns should be excluded from numeric outlier detection entirely. A skewed distribution on a boolean flag is a valid data pattern, not an anomaly. The diagnostic should produce zero warnings for these columns.

## Root cause

### Detection pipeline entry point (lines 81–88)

The anomaly detector routes columns to sub-detectors by type. Boolean columns (`BOOLEAN`, `BOOL`) match `ServerUtils.isNumericType()` because that regex matches `INT` in any type string containing it:

```dart
static final RegExp _reNumericType = RegExp(
  r'INT|REAL|NUM|FLOAT|DOUBLE|DECIMAL',
  caseSensitive: false,
);
```

There is no exclusion for boolean affinity before dispatching to `_detectNumericOutliers()`.

### Outlier heuristic (lines 196–235)

```dart
final avg = ServerUtils.toDouble(statsRows.first['avg_val']);
final min = ServerUtils.toDouble(statsRows.first['min_val']);
final max = ServerUtils.toDouble(statsRows.first['max_val']);
if (avg == null || min == null || max == null || avg == 0) {
  return;
}

// Flag when any extreme is more than 10× the average magnitude
if (max.abs() > avg.abs() * 10 || min.abs() > avg.abs() * 10) {
  anomalies.add(/* ... */);
}
```

### Execution trace for `is_nickname_only` (avg 0.09)

| Step | Value | Result |
|------|-------|--------|
| `avg` | `0.09` | Not null, not zero — continues |
| `min` | `0.0` | — |
| `max` | `1.0` | — |
| `avg == 0` guard | `false` | Does not early-return |
| `max.abs() > avg.abs() * 10` | `1.0 > 0.9` | `true` — **fires false positive** |

### Execution trace for `is_always_show_middle_name` (avg 0.00)

| Step | Value | Result |
|------|-------|--------|
| `avg` | `0.0` | — |
| `avg == 0` guard | `true` | Early-returns — **no false positive** |

The `avg == 0` guard accidentally prevents the false positive when *all* values are `false`. But any boolean column with even a small percentage of `true` values (1%+) will trigger the heuristic.

### Boolean affinity already exists elsewhere

`cell_update_handler.dart` (lines 359–360) already identifies boolean columns:

```dart
bool _isBooleanAffinity(String typeUpper) =>
    typeUpper == 'BOOLEAN' || typeUpper == 'BOOL';
```

The anomaly detector does not use this check.

## Affected table columns

Any boolean column with a skewed distribution where `1 ≤ avg < 0.1` (i.e., between 1% and 10% true) will trigger a false positive. Example columns from the `contacts` project:

| Table | Column | Avg | False Positive? |
|-------|--------|-----|-----------------|
| `public_figures` | `is_nickname_only` | 0.09 | Yes |
| `public_figures` | `is_always_show_middle_name` | 0.00 | No (avg == 0 guard) |

Any Drift project with boolean flags on large tables is susceptible.

## Suggested fix

### Option A: Exclude boolean columns from numeric outlier detection (recommended)

Add a boolean type check before dispatching to `_detectNumericOutliers()`:

```dart
// In the column-type routing section (lines 81–88):

// Skip outlier detection for boolean columns — skewed distributions
// (e.g., 9% true) are valid data patterns, not anomalies.
final bool isBooleanColumn = _isBooleanType(colType);

if (ServerUtils.isNumericType(colType) && !isBooleanColumn) {
  await _detectNumericOutliers(
    query: query,
    tableName: tableName,
    colName: colName,
    anomalies: anomalies,
  );
}
```

Add the helper (reusing the pattern from `cell_update_handler.dart`):

```dart
/// Returns true if the column type represents a boolean value.
static bool _isBooleanType(String type) {
  final String typeUpper = type.toUpperCase();
  return typeUpper == 'BOOLEAN' || typeUpper == 'BOOL' || typeUpper == 'BIT';
}
```

### Option B: Detect and skip binary-domain columns by value range

If schema type info is unreliable (e.g., booleans stored as plain `INTEGER`), check the domain instead:

```dart
// Inside _detectNumericOutliers, after computing min/max/avg:

// Skip binary-domain columns (range 0–1) — skewed distribution is expected.
if (min == 0 && max == 1) {
  return;
}
```

This catches boolean columns regardless of declared type but may skip legitimate integer columns that happen to have a 0–1 range.

### Option C: Combine both checks

Use Option A as the primary guard (schema-based), and Option B as a fallback for `INTEGER` columns that are semantically boolean:

```dart
if (ServerUtils.isNumericType(colType) && !_isBooleanType(colType)) {
  await _detectNumericOutliers(...);
}
```

```dart
// Inside _detectNumericOutliers:
if (min == 0 && max == 1) {
  return; // Binary-domain integer column, not a real outlier
}
```

### Recommended test case

```dart
test('skips outlier detection for BOOLEAN columns with skewed distribution', () async {
  final List<Map<String, dynamic>> anomalies = <Map<String, dynamic>>[];

  await AnomalyDetector.detectAnomalies(
    query: (String sql) async {
      if (sql.contains('AVG')) {
        return [{'avg_val': 0.09, 'min_val': 0.0, 'max_val': 1.0}];
      }
      return [];
    },
    columns: [_col('is_nickname_only', 'BOOLEAN')],
    tableName: 'public_figures',
    anomalies: anomalies,
  );

  expect(
    anomalies.where((Map<String, dynamic> a) => a['type'] == 'potential_outlier'),
    isEmpty,
    reason: 'Boolean columns with skewed distributions should not trigger outlier detection',
  );
});
```

## Affected code

- `lib/src/server/anomaly_detector.dart` — lines 81–88 (column type routing), lines 196–235 (`_detectNumericOutliers`)
- `test/anomaly_detector_test.dart` — missing test coverage for boolean column exclusion
- `extension/src/diagnostics/checkers/anomaly-checker.ts` — routes all non-FK anomalies to code `'anomaly'` (no change needed, but context for understanding diagnostic display)

## Related context

- `bugs/null_anomaly_false_positive_on_nullable_columns.md` — similar false-positive class, already fixed in `anomaly_detector.dart` lines 54–67
- `lib/src/server/cell_update_handler.dart` lines 359–360 — existing `_isBooleanAffinity()` helper that can be reused or mirrored
