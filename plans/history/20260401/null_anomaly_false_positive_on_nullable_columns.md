# Bug: NULL anomaly flags nullable columns as anomalous

**Created:** 2026-04-01
**Severity:** Medium — false positives erode trust in the anomaly scanner
**Component:** `lib/src/server/anomaly_detector.dart` — `_detectNullValues()`

---

## Summary

The anomaly detector reports NULL values in columns that are explicitly declared `.nullable()` in the Drift schema. A nullable column containing NULLs is expected behavior, not an anomaly. This produces false positives that train users to ignore the anomaly panel entirely.

## Reproduction

1. Define a Drift table with a nullable column:

```dart
class PublicHolidays extends Table {
  DateTimeColumn get updatedAt => dateTime().nullable()();
}
```

2. Insert rows without populating `updatedAt` (valid — the column is nullable).
3. Open the anomaly scanner.
4. Result:

```
[drift_advisor] 33 NULL value(s) in public_holidays.updated_at (100.0%)
```

Severity: `warning` (because >50% threshold is met).

## Expected behavior

No anomaly should be reported for NULL values in a column that the schema explicitly declares as nullable. The column's nullability is a deliberate design decision — the developer chose `.nullable()` because NULLs are a valid state for that field.

## Root cause

`_detectNullValues()` (lines 118-149) checks `notnull == 0` from `PRAGMA table_info()` only to decide *which* columns to scan — it then flags every one that has any NULLs. The logic treats "column allows NULLs" as a reason to inspect it, rather than as a signal that NULLs are expected.

The current threshold (`> 50%` = warning, `<= 50%` = info) does not help — even at `info` severity, reporting expected NULLs is noise.

## Suggested fix

### Option A: Skip nullable columns entirely (simplest)

If the column is declared nullable (`notnull == 0`), do not report NULL values at all. The developer explicitly opted in to NULLs. Only report NULLs in columns that are `NOT NULL` but somehow contain NULLs (which would indicate a constraint violation or data corruption — a genuine anomaly).

### Option B: Only flag NOT NULL columns with NULLs (schema-aware)

This would catch actual data integrity issues — rows where a NOT NULL column has NULLs due to schema migrations, direct SQL inserts bypassing constraints, or database corruption. These are real anomalies worth reporting at `error` severity.

### Option C: Require a high threshold for nullable columns (compromise)

If the team still wants visibility into nullable column usage patterns, raise the threshold significantly (e.g., only report when 100% of rows are NULL in a nullable column, at `info` severity, with a distinct message like "column is always NULL — consider removing it"). This separates "possible dead column" from "anomalous data."

## Impact

- **public_holidays table**: `updatedAt`, `createdAt`, `holidayDateJson`, `description`, `colorValue`, `location`, `urls`, `specialHolidayTypeName`, `cultureSportName`, `astronomicalEventName`, `observedOnJson`, `publicHolidaySaropaUUID`, `dataSource` — 13 of 15 columns are nullable. The scanner could produce up to 13 false positive anomalies for a single correctly-designed table.
- **User trust**: Developers seeing a wall of false positives will stop checking the anomaly panel, causing them to miss real issues like orphaned foreign keys or duplicate rows.

## Affected code

- `lib/src/server/anomaly_detector.dart` — `_detectNullValues()` (lines ~118-149)
- `test/anomaly_detector_test.dart` — NULL detection tests (lines ~84-126) will need updating to reflect new behavior

## Related context

The other four anomaly types (empty strings, numeric outliers, orphaned FKs, duplicate rows) do not have this problem — they all detect genuinely unexpected states rather than schema-declared valid states.
