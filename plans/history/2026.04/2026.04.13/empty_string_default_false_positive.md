## Title

Anomaly diagnostic falsely flags empty strings that come from a column's own default value

## Environment

- OS: Windows 11 Pro 10.0.22631
- VS Code version: 1.96.2
- Extension version: saropa_drift_advisor ext-v3.1.1
- Dart SDK version: 3.11.4 (stable)
- Flutter SDK version: 3.41.6 (stable)
- Database type and version: SQLite (via Drift 2.26.0 / drift_flutter 0.2.4)
- Connection method: Local file (drift_flutter default)
- Relevant non-default settings: None
- Other potentially conflicting extensions: None

## Steps to Reproduce

1. Create a Drift table with a text column that uses an empty-string default:
   ```dart
   class TvListings extends Table {
     IntColumn get id => integer().autoIncrement()();
     TextColumn get genres => text().withDefault(const Constant(''))();
   }
   ```
2. Insert rows without explicitly setting the `genres` column (letting the default apply).
3. Wait for Drift Advisor to analyze the database.
4. Open the Problems panel in VS Code.

## Expected Behavior

No anomaly diagnostic should be emitted for empty strings in `genres`, because the column's schema explicitly declares `withDefault(const Constant(''))`. Empty strings are the designed "no value" sentinel for this column. The advisor has access to the Drift schema and should recognize that a default value of `''` will naturally produce empty-string rows.

## Actual Behavior

The advisor emits an error-severity anomaly:

```
[drift_advisor] 84 empty string(s) in tv_listings.genres
```

This is a false positive. The empty strings are not data quality problems -- they are the column's own default value working as intended.

## Error Output

No console errors or stack traces. The diagnostic appears only in the VS Code Problems panel with severity "Error" (red), code `anomaly`, owner `drift-advisor`.

## Screenshots / Recordings

N/A -- the diagnostic text in the Problems panel is sufficient to reproduce.

## Minimal Reproducible Example

Any Drift table with a `text().withDefault(const Constant(''))()` column where some rows use the default. The advisor will flag the empty strings as anomalies.

```dart
class Example extends Table {
  IntColumn get id => integer().autoIncrement()();
  TextColumn get tags => text().withDefault(const Constant(''))();
}
```

Insert a few rows without setting `tags`, then let the advisor scan.

## What I Already Tried

- [x] Confirmed the empty strings match the column's declared default value
- [x] Verified the schema definition is correct (`withDefault(const Constant(''))`)
- [x] Confirmed no other anomaly rules are misconfigured
- [ ] Tested on a previous extension version

## Regression Info

- Last working version: Unknown (may have always been this way)
- First broken version: ext-v3.1.1
- What changed: Unknown

## Impact

- Who is affected: Any user with a text column that defaults to empty string
- What is blocked: The false positive is error-severity, which trains users to ignore real anomaly alerts. This undermines the entire anomaly detection feature.
- Data risk: None (diagnostic only, no data modification)
- Frequency: Every scan, deterministic, 100% reproducible

## Suggested Fix

When the anomaly detector counts empty strings (or any single repeated value), cross-reference the column's Drift schema definition. If the repeated value matches the column's declared `withDefault(...)` value, either:
1. Suppress the diagnostic entirely, or
2. Downgrade it to informational severity with a note like "N empty strings match the column default"

## Resolution

**Status:** Fixed

**Root cause:** `_detectEmptyStrings` in `anomaly_detector.dart` never checked the column's
`dflt_value` from `PRAGMA table_info`. Every NOT NULL text column with empty strings was
flagged unconditionally.

**Fix:** Before calling `_detectEmptyStrings`, the anomaly detector now reads `dflt_value`
from the PRAGMA result. If the default is `''` (or `""`), the empty-string check is skipped
entirely — option 1 from the suggested fix above.

**Files changed:**
- `lib/src/server/anomaly_detector.dart` — added `dflt_value` extraction and `hasEmptyDefault` guard
- `test/anomaly_detector_test.dart` — added test: `skips empty string check when column default is empty string`
