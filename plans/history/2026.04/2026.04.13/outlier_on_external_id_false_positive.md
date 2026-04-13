## Title

Outlier diagnostic falsely flags externally-assigned ID columns where normal distribution does not apply

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

1. Create a Drift table with an integer column that stores externally-assigned IDs:
   ```dart
   class TvListings extends Table {
     IntColumn get id => integer().autoIncrement()();
     IntColumn get tvmazeId => integer().nullable()();
   }
   ```
2. Insert rows with `tvmazeId` values from the TVMaze API. These IDs are assigned by TVMaze's database and are not sequential within this local dataset. Example values: `3387744`, `3595001`, `3595050`, `3595100`, `3595125`.
3. Wait for Drift Advisor to analyze the database.
4. Open the Problems panel in VS Code.

## Expected Behavior

No outlier diagnostic should be emitted for ID columns. External IDs (API identifiers, foreign system keys) are not measurements -- they are opaque identifiers. Statistical outlier detection (sigma-based deviation from mean) is meaningless for this data type because:

- IDs are not drawn from a normal distribution
- A "low" ID simply means the entity was created earlier in the external system
- The local dataset is a sparse, non-random sample of the external ID space

The advisor should recognize columns named `*_id` or typed as identifiers and skip outlier analysis on them.

## Actual Behavior

The advisor emits a warning-severity anomaly:

```
[drift_advisor] Potential outlier in tv_listings.tvmaze_id: min value 3387744.0 is 5.6σ from mean 3576818.33 (range [3387744.0, 3595125.0])
```

This is a false positive. The value `3387744` is a perfectly valid TVMaze ID -- it just belongs to a show that was added to TVMaze's database earlier than the others in this dataset.

## Error Output

No console errors or stack traces. The diagnostic appears only in the VS Code Problems panel with severity "Warning" (yellow), code `anomaly`, owner `drift-advisor`.

## Screenshots / Recordings

N/A -- the diagnostic text in the Problems panel is sufficient to reproduce.

## Minimal Reproducible Example

Any Drift table with an integer column storing external IDs where the IDs are not tightly clustered:

```dart
class Example extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get externalApiId => integer().nullable()();
}
```

Insert rows with `externalApiId` values like `[100, 50000, 50001, 50002, 50003]`. The value `100` will be flagged as an outlier even though it is a valid external ID.

## What I Already Tried

- [x] Confirmed the flagged value (`3387744`) is a valid TVMaze show ID
- [x] Verified other values in the column are also valid TVMaze IDs
- [x] Confirmed the column stores external identifiers, not measurements
- [ ] Tested on a previous extension version

## Regression Info

- Last working version: Unknown
- First broken version: ext-v3.1.1
- What changed: Unknown

## Impact

- Who is affected: Any user storing external API IDs (common pattern: TVMaze IDs, TMDB IDs, Stripe IDs, etc.)
- What is blocked: Not blocking, but warning-severity false positives erode trust in the advisor's diagnostics
- Data risk: None (diagnostic only)
- Frequency: Every scan, deterministic, 100% reproducible when ID values are spread out

## Resolution

Fixed in `lib/src/server/anomaly_detector.dart` with three guards added to `_detectNumericOutliers`:

1. **Primary key skip**: Columns with `pk > 0` in PRAGMA table_info are skipped — auto-increment IDs are sequential by definition.
2. **Identifier pattern skip**: Columns matching `_identifierPattern` (`*_id`, `*Id`, `*_key`, `*Key`, `*_code`, `*Code`, or exactly `id`) are skipped — external IDs are opaque identifiers, not measurements.
3. **Small sample guard**: Columns with fewer than 30 non-null values (`_minSampleSizeForOutliers`) are skipped — sigma-based detection is unreliable at small n.

Tests added in `test/anomaly_detector_test.dart`:
- `no outlier for identifier columns (external ID skip)` — exercises `tvmaze_id`, `externalApiId`, `stripe_key`, `countryCode`, `user_id`, `tmdb_id`
- `no outlier for primary key columns` — exercises a non-`id`-named PK column
- `no outlier when sample size is below minimum (n < 30)` — exercises the small sample guard
