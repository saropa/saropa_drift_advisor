## Title
Anomaly diagnostic flags valid rating value 1.0 as outlier despite being within defined column range

## Environment
- OS: Windows 11 Pro 10.0.22631 x64
- VS Code version: 1.96.2 (v22.22.1)
- Extension version: saropa_drift_advisor 3.2.0
- Dart SDK version: 3.11.4 (stable)
- Flutter SDK version: 3.41.6 (stable)
- Database type and version: SQLite (via Drift/drift_flutter)
- Connection method: Local file (drift_flutter driftDatabase helper)
- Relevant non-default settings: None
- Other potentially conflicting extensions: None relevant

## Steps to Reproduce
1. Open a Flutter project that uses Drift with a table containing a `RealColumn` for ratings.
2. The table schema defines no explicit min/max constraint, but the domain is 0.0–10.0 (standard TV episode rating scale).
3. Populate the table with real episode rating data from TVMaze. Some episodes legitimately have a rating of 1.0.
4. Open the file containing the Drift table class in VS Code.
5. Observe the diagnostics panel.

The table definition:

```dart
class ShowEpisodes extends Table {
  IntColumn get id => integer().autoIncrement()();
  IntColumn get showTvmazeId => integer()();
  IntColumn get tvmazeEpisodeId => integer()();
  IntColumn get season => integer()();
  IntColumn get number => integer().nullable()();
  TextColumn get name => text()();
  RealColumn get rating => real().nullable()();
  // ... other columns
}
```

## Expected Behavior
No anomaly diagnostic should fire for a value of 1.0 in a ratings column where the data range is [1.0, 10.0]. A 1.0 rating is a valid, real-world value — some TV episodes are genuinely rated that low by audiences.

## Actual Behavior
The extension produces this diagnostic on the `ShowEpisodes` table definition (line 64):

```
[drift_advisor] Potential outlier in show_episodes.rating: min value 1.0 is 6.4σ from mean 7.91 (range [1.0, 10.0])
```

Severity: Warning (2).

## Analysis
The anomaly detector appears to use a purely statistical approach (sigma distance from mean) without considering the bounded nature of rating data. On a 1–10 scale, a mean of 7.91 with most values clustered high is expected — TV ratings skew positive because viewers self-select shows they like. A value of 1.0 is rare but completely valid.

The diagnostic is not actionable: the developer cannot "fix" a legitimately low rating in source data from an external API.

## Suggested Fix
Consider one or more of these approaches:
- **Suppress anomaly detection for bounded numeric columns** where the observed range fits within a known scale (e.g., 0–10, 0–100, 0–5). If the min and max are both within a plausible rating/score range, the outlier is likely valid.
- **Raise the sigma threshold** for small bounded ranges. 6.4σ sounds alarming but is expected when data clusters at one end of a bounded scale.
- **Provide a way to suppress** the diagnostic per-column or per-table (e.g., `// drift_advisor:ignore anomaly` or a config option).

## What I Already Tried
- [x] Verified the data: the 1.0 rating is real data from TVMaze, not corruption
- [x] Confirmed the diagnostic is informational-only (severity 2) and does not block anything
- [x] No way to suppress the diagnostic via extension settings

## Impact
- Who is affected: Any user with real-world rating/score data that has natural outliers
- What is blocked: Nothing blocked, but the persistent warning creates noise and trains users to ignore diagnostics
- Data risk: None
- Frequency: Every time the file is opened, as long as the data contains the outlier value
