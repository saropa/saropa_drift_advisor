## Title

Outlier diagnostic falsely flags valid extreme values in bounded rating columns

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

1. Create a Drift table with a real column storing ratings:
   ```dart
   class ShowEpisodes extends Table {
     IntColumn get id => integer().autoIncrement()();
     RealColumn get rating => real().nullable()();
   }
   ```
2. Insert episode ratings from TVMaze. Most episodes in a user's watched list are from shows they enjoy, so ratings cluster around 7-9. Occasionally an episode genuinely rates at 1.0 (the scale is 1.0 to 10.0).
3. Wait for Drift Advisor to analyze the database.
4. Open the Problems panel in VS Code.

## Expected Behavior

No outlier diagnostic should be emitted for a rating of 1.0 when the data range is [1.0, 10.0]. The value 1.0 is:

- Within the valid domain of the rating scale (1-10)
- The minimum of a bounded scale, which is a legitimate value
- Not a data entry error or corruption

Bounded scales (ratings, percentages, scores) are inherently non-Gaussian -- they have hard floor and ceiling values. Applying sigma-based outlier detection to bounded data will always flag valid extreme values as outliers when the data is skewed (which rating data almost always is, because people tend to watch shows they like).

## Actual Behavior

The advisor emits an info-severity anomaly (blue in the Problems panel):

```
[drift_advisor] Potential outlier in show_episodes.rating: min value 1.0 is 5.9σ from mean 7.99 (range [1.0, 10.0])
```

Diagnostic code: `anomaly`, severity: Information (mapped from `'info'` in `anomaly_detector.dart:383` through `anomaly-checker.ts:33-37`).

This is a false positive. A rating of 1.0 on a 1-10 scale is a valid, meaningful data point. The high sigma value is an artifact of survivorship bias in the dataset (users watch shows they like, so most ratings are high), not a sign of data corruption.

## Error Output

No console errors or stack traces. The diagnostic appears only in the VS Code Problems panel with severity "Information" (blue), code `anomaly`, owner `drift-advisor`.

## Screenshots / Recordings

N/A -- the diagnostic text in the Problems panel is sufficient to reproduce.

## Minimal Reproducible Example

Any Drift table with a real column storing bounded ratings where most values cluster near one end of the scale:

```dart
class Example extends Table {
  IntColumn get id => integer().autoIncrement()();
  RealColumn get score => real().nullable()();
}
```

Insert rows with `score` values: `[1.0, 7.5, 8.0, 8.2, 8.5, 8.8, 9.0, 9.1, 9.3, 9.5]`. The value `1.0` will be flagged as an outlier even though it is a valid score on the 1-10 scale.

## What I Already Tried

- [x] Confirmed the flagged value (1.0) is a valid TVMaze episode rating
- [x] Verified the rating scale is 1.0-10.0 as documented by TVMaze's API
- [x] Confirmed the skewed distribution is expected (survivorship bias in user-selected shows)
- [ ] Tested on a previous extension version

## Regression Info

- Last working version: Unknown — likely present since outlier detection was introduced
- First broken version: Unknown — the 3σ approach has no bounded-scale awareness since inception. Commit `92592fd` added domain heuristics (coordinates, timestamps, etc.) and log-scale fallback, but did not address bounded rating scales.
- What changed: Not a regression — this is a gap in the original outlier detection design

## Impact

- Who is affected: Any user storing ratings, scores, percentages, or other bounded numeric values
- What is blocked: Not blocking, but info-severity false positives on valid data erode trust in the advisor's diagnostics
- Data risk: None (diagnostic only)
- Frequency: Every scan, deterministic, 100% reproducible when bounded data has a skewed distribution (which is extremely common for ratings)

## Suggested Fix

The outlier detection lives in `_detectNumericOutliers()` in `lib/src/server/anomaly_detector.dart` (line 260). It already has domain-aware skip patterns for coordinates, versions, timestamps, sort order, and year columns (lines 208-244). The fix should extend this approach.

Consider one or more of these approaches:

1. **Bounded range detection** (in `_detectNumericOutliers`): After computing min/max/avg/stddev, check whether the observed range fits a known bounded scale (e.g., [0,1], [0,5], [0,10], [0,100], [1,5], [1,10]). If min and max both fall within a recognized scale, suppress outlier alerts for values at the scale boundaries. A value of 1.0 in a [1,10] range is the scale minimum, not an outlier. This is the most robust approach because it works regardless of column naming.
2. **Column name heuristic**: Add a skip pattern (like the existing `_coordinatePattern`, `_versionPattern`, etc.) for columns named `*rating*`, `*score*`, `*percent*`, `*pct*`, etc. Note: the existing `_sortOrderPattern` already matches `^rank$` exactly — a new pattern for rating/score columns must not accidentally overlap or conflict with existing patterns.
3. **Skewness check**: Before applying symmetric Gaussian outlier rules, check the skewness of the distribution. Highly skewed data (common in rating columns) will always produce false-positive outliers at the thin tail. This could be computed in the same SQL query that fetches the stats (line 281) by adding `AVG(X*X*X)` for third-moment estimation. Consider using percentile-based outlier detection (IQR method) instead of sigma-based for skewed data.
4. **Domain-aware thresholds**: For columns where the range covers a bounded scale, only flag values that fall *outside* the scale boundaries (e.g., a rating of -1 or 11 on a 1-10 scale) rather than values at the extremes of the scale.

### Note on diagnostic code mapping

The `outlier-detected` code defined in `extension/src/diagnostics/codes/data-quality-codes.ts:40-47` is not used for anomalies from the Dart-side detector. The `anomaly-checker.ts` maps all non-error anomalies to diagnostic code `anomaly`. If the fix changes severity or adds richer diagnostic codes, both `anomaly_detector.dart` and `anomaly-checker.ts` need coordinated updates.
